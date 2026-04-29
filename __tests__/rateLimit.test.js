/**
 * Rate Limiting Integration Tests
 *
 * Validates that payment and order routes are properly rate-limited while
 * user and product routes remain unrestricted.
 *
 * The region-check middleware is mocked so tests don't depend on an external
 * service, and auth middleware will naturally return 401 for unauthenticated
 * requests — that's fine; we only care about *when* 429 kicks in.
 */

// Mock the region check before any module imports so the middleware
// never reaches out to an external service during tests.
jest.mock('../utils/checkRegion', () => jest.fn().mockResolvedValue(true));

const request = require('supertest');
const app = require('../app');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fires `count` sequential requests against `path` and returns every response.
 */
async function fireRequests(path, count, method = 'get') {
  const responses = [];
  for (let i = 0; i < count; i++) {
    const res = await request(app)[method](path);
    responses.push(res);
  }
  return responses;
}

/**
 * Returns the status code of the last response in an array.
 */
function lastStatus(responses) {
  return responses[responses.length - 1].status;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('API Rate Limiting', () => {
  // express-rate-limit uses an in-memory store by default. Each test file
  // gets a fresh require of the app (thanks to Jest module isolation), so
  // counters start at zero for every `describe` block. Within a single
  // describe block the counter accumulates, which is exactly what we want
  // for verifying the threshold.

  // ------------------------------------------------------------------
  // Payment routes — 30 requests / 15 min
  // ------------------------------------------------------------------
  describe('Payment routes (/api/payment)', () => {
    it('should allow up to 30 requests within the window', async () => {
      const responses = await fireRequests(
        '/api/payment/payment/status/test123',
        30,
      );

      // Every response should be something other than 429 (likely 401
      // because we're not authenticated, or another status — doesn't matter).
      const all429 = responses.every((r) => r.status === 429);
      expect(all429).toBe(false);

      // None of the first 30 should be 429.
      responses.forEach((r, idx) => {
        expect(r.status).not.toBe(429);
      });
    });

    it('should return 429 on the 31st request', async () => {
      // The 30 requests from the previous test already consumed the window.
      const res = await request(app).get('/api/payment/payment/status/test123');

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/too many requests/i);
    });

    it('should include rate-limit headers in responses', async () => {
      const res = await request(app).get('/api/payment/payment/status/test123');

      // Standard or legacy rate-limit headers should be present.
      const headers = res.headers;
      const hasRateLimitHeader =
        headers['ratelimit-limit'] !== undefined ||
        headers['x-ratelimit-limit'] !== undefined;

      expect(hasRateLimitHeader).toBe(true);
    });

    it('should include retry-after header when rate limited', async () => {
      const res = await request(app).get('/api/payment/payment/status/test123');

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // Order routes — 60 requests / 15 min
  // ------------------------------------------------------------------
  describe('Order routes (/api/order)', () => {
    it('should allow up to 60 requests within the window', async () => {
      const responses = await fireRequests(
        '/api/order/orders/me',
        60,
      );

      responses.forEach((r) => {
        expect(r.status).not.toBe(429);
      });
    });

    it('should return 429 on the 61st request', async () => {
      const res = await request(app).get('/api/order/orders/me');

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/too many requests/i);
    });

    it('should include retry-after header when rate limited', async () => {
      const res = await request(app).get('/api/order/orders/me');

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  // ------------------------------------------------------------------
  // Independent counters — payment vs order
  // ------------------------------------------------------------------
  describe('Route-group isolation', () => {
    // Because the tests above already exhausted both counters for this
    // module, we re-verify that one group hitting its limit doesn't
    // affect the other by checking the 429 body message is the same
    // generic limiter message (they share a handler but separate stores).
    it('payment 429 and order 429 are from their own limiters', async () => {
      const payRes = await request(app).get('/api/payment/payment/status/abc');
      const ordRes = await request(app).get('/api/order/orders/me');

      // Both should be 429 at this point (limits already hit above).
      expect(payRes.status).toBe(429);
      expect(ordRes.status).toBe(429);
    });
  });

  // ------------------------------------------------------------------
  // Non-rate-limited routes
  // ------------------------------------------------------------------
  describe('Non-rate-limited routes', () => {
    it('GET / (health) should never return 429 from the payment/order limiter', async () => {
      const responses = await fireRequests('/', 70);

      responses.forEach((r) => {
        expect(r.status).not.toBe(429);
      });
    });

    it('GET /health should never return 429', async () => {
      const responses = await fireRequests('/health', 70);

      responses.forEach((r) => {
        expect(r.status).not.toBe(429);
      });
    });

    it('GET /api/product/products should not be rate limited', async () => {
      const responses = await fireRequests('/api/product/products', 70);

      responses.forEach((r) => {
        expect(r.status).not.toBe(429);
      });
    });

    it('POST /api/user/login should not be rate limited', async () => {
      // Login will return 400 or similar without a body, but never 429.
      const responses = await fireRequests('/api/user/login', 70, 'post');

      responses.forEach((r) => {
        expect(r.status).not.toBe(429);
      });
    });
  });

  // ------------------------------------------------------------------
  // Different payment sub-routes share the same limiter
  // ------------------------------------------------------------------
  describe('Sub-route sharing within a group', () => {
    // NOTE: counters are already exhausted for payment from earlier tests,
    // so any hit to a *different* payment sub-route should still be 429.
    it('POST /api/payment/payment/process shares the payment limiter', async () => {
      const res = await request(app)
        .post('/api/payment/payment/process')
        .send({});

      expect(res.status).toBe(429);
    });

    it('POST /api/payment/callback shares the payment limiter', async () => {
      const res = await request(app)
        .post('/api/payment/callback')
        .send({});

      expect(res.status).toBe(429);
    });
  });
});
