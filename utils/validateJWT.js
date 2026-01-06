const { jwtVerify, createRemoteJWKSet, jwksCache } = require('jose');

function createCFAuthorizationJWTValidator(options) {
  const {
    jwksUri,
    issuer,
    audience, 
    algorithms = ['RS256'],
    fetchTimeoutMs = 5000,
    cacheTtlMs = 10 * 60 * 1000,
    cooldownDurationMs = 30 * 1000, // helps prevent refetch abuse
  } = options || {};

  if (!jwksUri) throw new Error('createCFAuthorizationJWTValidator: jwksUri is required');

  // jose-managed remote JWKS resolver (handles caching + refresh/rotation)
  const remoteJWKSet = createRemoteJWKSet(new URL(jwksUri), {
    timeoutDuration: fetchTimeoutMs,
    cacheMaxAge: cacheTtlMs,
    cooldownDuration: cooldownDurationMs,
    headers: { accept: 'application/json' },
  });

  /**
   * Pull the raw JWK (object) from jose's internal JWKS cache
   */
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

  /**
   * Validate a JWT string (returns payload if valid).
   */
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

      return {
        payload,
        protectedHeader,
        signingKey, // raw JWK object (best-effort)
        jwksUri,
      };
    } catch (e) {
      // If remote fetch fails, jose typically throws fetch / JWKS related errors.
      // We keep your prior behavior: treat JWKS problems as 503.
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

  function getCFAuthorizationFromRequest(req) {
    return req?.cookies?.CF_Authorization || null;
  }

  function middleware() {
    return async (req, res, next) => {
      try {
        const token = getCFAuthorizationFromRequest(req);
        if (!token) return res.status(401).json({ error: 'Missing CF_Authorization cookie' });

        const result = await validateJWT(token);

        req.userClaims = result.payload;
        req.jwtHeader = result.protectedHeader;
        req.jwtSigningKey = result.signingKey;
        req.jwksUri = result.jwksUri;

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
    getCFAuthorizationFromRequest,
    middleware,
    _remoteJWKSet: remoteJWKSet,
  };
}

module.exports = { createCFAuthorizationJWTValidator };
