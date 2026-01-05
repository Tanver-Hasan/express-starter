// cf-auth-jwt.js (CommonJS)
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
    issuer,               // string or undefined
    audience,             // string or string[] or undefined
    algorithms = ['RS256'],
    fetchTimeoutMs = 5000,
    cacheTtlMs = 10 * 60 * 1000,
  } = options || {};

  if (!jwksUri) throw new Error('createCFAuthorizationValidator: jwksUri is required');

  const cache = createInMemoryKeyCache({ ttlMs: cacheTtlMs });

  async function fetchKeyFromJWKS(kid) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    console.log('Fetching JWKS from:', jwksUri);
    try {
      const res = await fetch(jwksUri, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        const msg = `Error fetching JWKS: ${res.status}`;
        const err = new Error(msg);
        err.code = 'JWKS_FETCH_FAILED';
        throw err;
      }

      const jwks = await res.json();
      const key = jwks?.keys?.find((k) => k.kid === kid);

      if (!key) {
        const err = new Error(`Key not found in JWKS for kid=${kid}`);
        err.code = 'JWKS_KEY_NOT_FOUND';
        throw err;
      }
      console.log('Found key in JWKS for kid:', kid);
      return key;
    } catch (e) {
        console.error('Error fetching JWKS:', e);
      // Normalize abort errors
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

  async function getPublicKeyForKid(kid, headerAlg) {
    console.log('Looking up key for kid:', kid);
    const cached = cache.get(kid);
    if (cached) {
      // Convert raw JWK -> KeyLike (KeyObject) each time (fast enough), or cache KeyLike if you prefer.
      return importJWK(cached, cached.alg || headerAlg);
    }

    const jwk = await fetchKeyFromJWKS(kid);
    console.log('Fetched JWK from JWKS for kid:', kid);
    cache.set(kid, jwk);

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
    console.log('Validating token:', token);
    // jose will decode header and call the key function
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
        console.log('Fetching public key for kid:', kid);
        console.log('Header alg:', header.alg);
        return getPublicKeyForKid(kid, header.alg);
      },
      {
        issuer: issuer || undefined,
        audience: audience || undefined,
        algorithms,
      }
    );
    console.log('Token is valid. Payload:', payload);
    return { payload, protectedHeader };
  }

  /**
   * Extract CF_Authorization cookie from an Express request (cookie-parser required).
   */
  function getCFAuthorizationFromRequest(req) {
    const token = req?.cookies?.CF_Authorization;
    return token || null;
  }

  /**
   * Express middleware: validates CF_Authorization and attaches req.userClaims
   */
  function middleware() {
    return async (req, res, next) => {
      try {
        const token = getCFAuthorizationFromRequest(req);
        if (!token) return res.status(401).json({ error: 'Missing CF_Authorization cookie' });

        const { payload } = await validateJWT(token);
        req.userClaims = payload;
        return next();
      } catch (e) {
        // If JWKS is down, you may want 503 to allow retry
        if (e?.code && String(e.code).startsWith('JWKS_')) {
          return res.status(503).json({ error: 'JWKS unavailable, retry later' });
        }
        return res.status(401).json({ error: 'Invalid token', detail: e.message });
      }
    };
  }

  return {
    validateJWT,
    getCFAuthorizationFromRequest,
    middleware,
    _cache: cache, // optional: expose for tests
  };
}

module.exports = { createCFAuthorizationJWTValidator };
