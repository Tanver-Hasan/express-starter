const { jwtVerify, importJWK } = require('jose');

function createInMemoryKeyCache({ ttlMs = 10 * 60 * 1000 } = {}) {
  const store = new Map(); // kid -> { value: jwkObject, expiresAt: number }

  return {
    get(kid) {
      const v = store.get(kid);
      if (!v) return null;
      if (Date.now() > v.expiresAt) {
        store.delete(kid);
        return null;
      }
      return v.value;
    },
    set(kid, jwkObject) {
      store.set(kid, { value: jwkObject, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      store.clear();
    },
  };
}

function createCFAuthorizationJWTValidator(options) {
  const {
    jwksUri,
    issuer,
    audience, // optional
    algorithms = ['RS256'],
    fetchTimeoutMs = 5000,
    cacheTtlMs = 10 * 60 * 1000,
  } = options || {};

  if (!jwksUri) throw new Error('createCFAuthorizationJWTValidator: jwksUri is required');

  const cache = createInMemoryKeyCache({ ttlMs: cacheTtlMs });

  async function fetchKeyFromJWKS(kid) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

    try {
      const res = await fetch(jwksUri, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = new Error(`Error fetching JWKS: ${res.status}`);
        err.code = 'JWKS_FETCH_FAILED';
        throw err;
      }

      const jwks = await res.json();
      const key = jwks?.keys?.find((k) => k.kid === kid);

      if (!key || typeof key !== 'object') {
        const err = new Error(`Key not found in JWKS for kid=${kid}`);
        err.code = 'JWKS_KEY_NOT_FOUND';
        throw err;
      }

      return key; //  raw JWK object
    } catch (e) {
      if (e?.name === 'AbortError') {
        const err = new Error('JWKS fetch timeout');
        err.code = 'JWKS_FETCH_TIMEOUT';
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get RAW JWK (object) from cache or JWKS endpoint
   */
  async function getPublicJwkForKid(kid) {
    const cached = cache.get(kid);
    if (cached) return cached;

    const jwk = await fetchKeyFromJWKS(kid);
    cache.set(kid, jwk);
    return jwk;
  }

  /**
   * Get KeyLike (crypto key) for jose verification
   */
  async function getKeyLikeForKid(kid, headerAlg) {
    const jwk = await getPublicJwkForKid(kid);
    return importJWK(jwk, jwk.alg || headerAlg);
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

    let usedJwk; // raw JWK used

    const { payload, protectedHeader } = await jwtVerify(
      token,
      async (header) => {
        const kid = header?.kid;
        if (!kid) {
          const err = new Error('JWT header missing kid');
          err.code = 'KID_MISSING';
          throw err;
        }

        if (header?.alg && !algorithms.includes(header.alg)) {
          const err = new Error(`Disallowed alg: ${header.alg}`);
          err.code = 'ALG_NOT_ALLOWED';
          throw err;
        }

        // fetch raw JWK for display + cache
        usedJwk = await getPublicJwkForKid(kid);

        // return KeyLike to jose 
        return getKeyLikeForKid(kid, header.alg);
      },
      {
        issuer: issuer || undefined,
        ...(audience ? { audience } : {}), // optional
        algorithms,
      }
    );

    return {
      payload,
      protectedHeader,
      signingKey: usedJwk, // raw JWK object for your EJS page
      jwksUri,
    };
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
        if (e?.code && String(e.code).startsWith('JWKS_')) {
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
    _cache: cache,
  };
}

module.exports = { createCFAuthorizationJWTValidator };
