const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { createCFAuthorizationJWTValidator } = require('./utils/validateJWT');


dotenv.config();
const port = process.env.PORT || 80;

const app = express();
app.use(cookieParser());

const validator = createCFAuthorizationJWTValidator({
  jwksUri: process.env.CF_JWKS_URI || 'https://thasan.cloudflareaccess.com/cdn-cgi/access/certs',
  issuer: process.env.CF_JWT_ISSUER || "https://thasan.cloudflareaccess.com",     // recommended
  // audience: process.env.CF_JWT_AUDIENCE, // recommended if you have it
  algorithms: ['RS256'],
  fetchTimeoutMs: 5000,
  cacheTtlMs: 10 * 60 * 1000,
});



// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Simple middleware for logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Home route
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Home',
    message: 'Welcome to the Express Starter Lab',
  });
});

// About route
app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About',
    description: 'This is a simple Express app running on AWS EC2 behind Cloudflare Tunnel.',
  });
});

// Status route (shows some runtime info)
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

// Simple JSON API route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Service is healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/protected', validator.middleware(), (req, res) => {
  const claims = req.userClaims || {};
  const token = req.cookies?.CF_Authorization || '';

  const aud = claims.aud;
  const audience =
    Array.isArray(aud) ? aud.join(', ') :
      typeof aud === 'string' ? aud :
        aud != null ? String(aud) : '—';

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



// 404 handler (for unknown routes)
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
