const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const oas3Tools = require('oas3-tools');
const dotenv = require('dotenv');
const helmet = require('helmet');
const hpp = require('hpp');
const pinoHttp = require('pino-http');
const { createCFAuthorizationJWTValidator } = require('./utils/validateJWT');
const { createLogoutRoute } = require('./utils/logout');

dotenv.config();

const config = {
  // Prefer PORT (e.g., from the platform) then APP_PORT (Terraform), default to 3000.
  port: Number(process.env.PORT || process.env.APP_PORT) || 3000,
  viewsPath: path.join(__dirname, 'views'),
  apiSpecPath: path.join(__dirname, './api/schema/openapi.yaml'),
  apiControllersPath: path.join(__dirname, './api/controllers'),
  appDomain: process.env.APP_DOMAIN || 'https://tools.tanverhasan.com',
  cfAuth: {
    jwksUri: process.env.CF_JWKS_URI || 'https://thasan.cloudflareaccess.com/cdn-cgi/access/certs',
    issuer: process.env.CF_JWT_ISSUER || 'https://thasan.cloudflareaccess.com',
    audience:
      process.env.CF_JWT_AUDIENCE ||
      '83fc9be602db641e15bd3a5dd3e229be29a2ba44b778892490cb82939c43129e',
    algorithms: ['RS256'],
    fetchTimeoutMs: 5000,
    cacheTtlMs: 10 * 60 * 1000,
  },
};

const app = express();
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', config.viewsPath);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use('/api/docs', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'"
  );
  next();
});
app.use(cookieParser());
app.use(hpp());

const logger = pinoHttp({
  level: process.env.LOG_LEVEL || 'info',
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} -> ${err.message}`,
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.ip,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

app.use(logger);
app.use((req, res, next) => {
  if (req.id) {
    res.setHeader('X-Request-Id', req.id);
  }
  next();
});

const validator = createCFAuthorizationJWTValidator(config.cfAuth);

const openApiAppConfig = oas3Tools.expressAppConfig(config.apiSpecPath, {
  routing: { controllers: config.apiControllersPath },
});
app.use('/api', openApiAppConfig.getApp());

app.get(
  '/logout',
  createLogoutRoute({
    appDomain: config.appDomain,
    redirectAfter: '/', // homepage or login screen
  })
);

app.get('/debug/headers', (req, res) => {
  const headersWithoutCookie = { ...req.headers };
  delete headersWithoutCookie.cookie;

  res.json({
    cloudflareAccess: {
      cfAccessJwtAssertionHeader: req.get('Cf-Access-Jwt-Assertion') || null,
      cfAuthorizationCookie: req.cookies?.CF_Authorization || null,
      hasCfAuthorizationCookie: Boolean(req.cookies?.CF_Authorization),
    },
    headers: headersWithoutCookie,
    rawCookieHeader: req.headers.cookie || null,
    cookies: req.cookies || {},
  });
});

app.get('/', (req, res) => {
  res.render('home', {
    title: 'Home',
    message: 'Welcome to the Express Starter Lab',
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About',
    description: 'This is a simple Express app running on AWS EC2 behind Cloudflare Tunnel.',
  });
});

app.get('/status', (req, res) => {
  const uptimeSeconds = process.uptime();
  res.render('status', {
    title: 'App Status',
    uptimeSeconds,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/protected', validator.middleware(), (req, res) => {
  const claims = req.userClaims || {};
  const token = req.cookies?.CF_Authorization || '';

  const aud = claims.aud;
  const audience =
    Array.isArray(aud) ? aud.join(', ') : typeof aud === 'string' ? aud : aud != null ? String(aud) : '—';

  res.render('protected', {
    title: 'Protected',
    token,
    claims,
    subject: claims.sub || '—',
    issuer: claims.iss || '—',
    audience,
    expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : '—',
    issuedAt: claims.iat ? new Date(claims.iat * 1000).toISOString() : '—',
    nowUtc: new Date().toISOString(),
    jwksUri: req.jwksUri || '—',
    signingKey: req.jwtSigningKey || null,
    jwtHeader: req.jwtHeader || null,
  });
});

app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

if (require.main === module) {
  app.listen(config.port, () => {
    app.log?.info ? app.log.info({ port: config.port }, 'Server listening') : console.log(`Example app listening on port ${config.port}`);
  });
}

module.exports = app;
