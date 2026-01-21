const { jwtVerify, createRemoteJWKSet, jwksCache } = require('jose');

function createCFAuthorizationJWTValidator(options) {
  const {
    jwksUri,
    issuer,
    audience,
    algorithms = ['RS256'],
    fetchTimeoutMs = 5000,
    cacheTtlMs = 10 * 60 * 1000,
    cooldownDurationMs = 30 * 1000,
    // Cloudflare recommends validating the header instead of the cookie.
    allowCookieFallback = true,
  } = options || {};

  if (!jwksUri) throw new Error('createCFAuthorizationJWTValidator: jwksUri is required');

  const remoteJWKSet = createRemoteJWKSet(new URL(jwksUri), {
    timeoutDuration: fetchTimeoutMs,
    cacheMaxAge: cacheTtlMs,
    cooldownDuration: cooldownDurationMs,
    headers: { accept: 'application/json' },
  });

  function getRawJwkFromRemoteCache(kid) {
    try {
      const cache = remoteJWKSet[jwksCache];
      const keys = cache?.jwks?.keys;
      if (!Array.isArray(keys)) return null;
      return keys.find((k) => k && k.kid === kid) || null;
    } catch {
      return null;
    }
  }

  async function validateJWT(token) {
    if (!token || typeof token !== 'string') {
      const err = new Error('Missing token');
      err.code = 'TOKEN_MISSING';
      throw err;
    }

    try {
      const { payload, protectedHeader } = await jwtVerify(token, remoteJWKSet, {
        issuer: issuer || undefined,
        ...(audience ? { audience } : {}),
        algorithms,
      });

      const signingKey = protectedHeader?.kid
        ? getRawJwkFromRemoteCache(protectedHeader.kid)
        : null;

      return { payload, protectedHeader, signingKey, jwksUri };
    } catch (e) {
      const msg = String(e?.message || '');
      const isLikelyJwksIssue =
        msg.toLowerCase().includes('jwks') ||
        msg.toLowerCase().includes('fetch') ||
        msg.toLowerCase().includes('timeout') ||
        msg.toLowerCase().includes('cooldown');

      if (isLikelyJwksIssue) {
        const err = new Error(e.message || 'JWKS unavailable');
        err.code = 'JWKS_UNAVAILABLE';
        throw err;
      }

      throw e;
    }
  }

  /**
   * Prefer Cloudflare's injected header:
   *   Cf-Access-Jwt-Assertion: <JWT>
   *
   * Fallback (optional):
   *   Cookie: CF_Authorization=<JWT>
   */
  function getTokenFromRequest(req) {
    // Express lowercases header names internally, but req.get() is case-insensitive.
    const headerToken = req?.get?.('Cf-Access-Jwt-Assertion') || null;
    if (headerToken && typeof headerToken === 'string') return headerToken.trim();

    if (allowCookieFallback) {
      const cookieToken = req?.cookies?.CF_Authorization || null;
      if (cookieToken && typeof cookieToken === 'string') return cookieToken.trim();
    }

    return null;
  }

  function middleware() {
    return async (req, res, next) => {
      try {
        const token = getTokenFromRequest(req);

        if (!token) {
          return res.status(401).json({
            error: 'Missing Cloudflare Access token',
            detail: allowCookieFallback
              ? 'Expected Cf-Access-Jwt-Assertion header (preferred) or CF_Authorization cookie (fallback).'
              : 'Expected Cf-Access-Jwt-Assertion header.',
          });
        }

        const result = await validateJWT(token);

        req.userClaims = result.payload;
        req.jwtHeader = result.protectedHeader;
        req.jwtSigningKey = result.signingKey;
        req.jwksUri = result.jwksUri;

        // Useful for debugging / audits
        req.cfAccessTokenSource = req.get('Cf-Access-Jwt-Assertion')
          ? 'header:Cf-Access-Jwt-Assertion'
          : 'cookie:CF_Authorization';

        return next();
      } catch (e) {
        if (e?.code === 'JWKS_UNAVAILABLE') {
          return res.status(503).json({ error: 'JWKS unavailable, retry later', detail: e.message });
        }
        return res.status(401).json({ error: 'Invalid token', detail: e.message });
      }
    };
  }

  return {
    validateJWT,
    getTokenFromRequest, 
    middleware,
    _remoteJWKSet: remoteJWKSet,
  };
}

module.exports = { createCFAuthorizationJWTValidator };
