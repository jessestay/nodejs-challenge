/**
 * Rate Limiting Integration Tests
 *
 * Validates that payment and order routes are properly rate-limited while
 * user and product routes remain unrestricted.
 *
 * External dependencies (region-check service, MongoDB) are mocked so tests
 * run in complete isolation — no network, no database. Auth middleware
 * naturally returns 401 for unauthenticated requests; we only care about
 * *when* 429 kicks in.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module imports
// ---------------------------------------------------------------------------

// Prevent the region-check middleware from reaching an external service.
jest.mock('../utils/checkRegion', () => jest.fn().mockResolvedValue(true));

// Prevent Mongoose from trying to connect to MongoDB.  Product and user
// controllers call Model methods (countDocuments, find, findOne, …) that
// would hang indefinitely without a live database.  Returning empty results
// is enough — we only need the route to respond, not return real data.
jest.mock('mongoose', () => {
  const chainable = () => {
    const obj = {
      select: () => obj,
      sort: () => obj,
      limit: () => obj,
      skip: () => obj,
      clone: () => obj,
      populate: () => obj,
      lean: () => obj,
      exec: () => Promise.resolve([]),
      then: (resolve) => resolve([]),
    };
    return obj;
  };

  const Model = function () {};
  Model.find = chainable;
  Model.findOne = () => Promise.resolve(null);
  Model.findById = () => Promise.resolve(null);
  Model.countDocuments = () => Promise.resolve(0);
  Model.create = () => Promise.resolve({});
  Model.prototype.save = () => Promise.resolve({});

  return {
    Schema: class Schema {
      constructor() {}
      pre() { return this; }
      post() { return this; }
      methods = {};
      statics = {};
    },
    model: () => Model,
    connect: () => Promise.resolve(),
    connection: { on: () => {}, once: () => {} },
    Types: { ObjectId: String },
  };
});

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

// ---------------------------------------------------------------------------
// Test suites
//
// IMPORTANT: express-rate-limit uses an in-memory store.  Because all tests
// share the same `app` instance (and therefore the same limiter instances),
// request counters accumulate across tests within this file.  Each test is
// written to be self-contained by sending exactly the number of requests it
// needs, accounting for any requests already sent by earlier tests.  The
// counters are laid out explicitly below so the math is auditable.
//
// Payment limiter (max 30):
//   • "allow up to 30"  — sends 30   → counter = 30
//   • "429 on 31st"     — sends  1   → counter = 31 (over limit)
//   • "rate-limit headers" — sends 1 → counter = 32
//   • "retry-after"     — sends  1   → counter = 33
//
// Order limiter (max 60):
//   • "allow up to 60"  — sends 60   → counter = 60
//   • "429 on 61st"     — sends  1   → counter = 61 (over limit)
//   • "retry-after"     — sends  1   → counter = 62
//
// Route-group isolation:
//   • sends 1 payment + 1 order      → payment = 34, order = 63
//     (both already over limit, proving independent counters)
//
// Sub-route sharing:
//   • sends 1 to /payment/process    → payment = 35 (still over limit)
//   • sends 1 to /payment/callback   → payment = 36 (still over limit)
// ---------------------------------------------------------------------------

describe('API Rate Limiting', () => {

  // ------------------------------------------------------------------
  // Payment routes — 30 requests / 15 min
  // ------------------------------------------------------------------
  describe('Payment routes (/api/payment)', () => {
    it('should allow up to 30 requests within the window', async () => {
      const responses = await fireRequests(
        '/api/payment/payment/status/test123',
        30,
      );

      // None of the first 30 should be 429 (they'll likely be 401
      // because we're not authenticated — that's fine).
      responses.forEach((r) => {
        expect(r.status).not.toBe(429);
      });
    });

    it('should return 429 on the 31st request', async () => {
      // Counter is at 30 from the test above; this is request #31.
      const res = await request(app).get('/api/payment/payment/status/test123');

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/too many requests/i);
    });

    it('should include rate-limit headers in responses', async () => {
      const res = await request(app).get('/api/payment/payment/status/test123');

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
      const responses = await fireRequests('/api/order/orders/me', 60);

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
    it('payment and order limiters use independent counters', async () => {
      // Both groups have already exceeded their limits above.
      // If they shared a counter, one would have been exhausted long
      // before the other.  Hitting both and seeing 429 on each confirms
      // independent stores.
      const payRes = await request(app).get('/api/payment/payment/status/abc');
      const ordRes = await request(app).get('/api/order/orders/me');

      expect(payRes.status).toBe(429);
      expect(ordRes.status).toBe(429);
    });
  });

  // ------------------------------------------------------------------
  // Non-rate-limited routes
  // ------------------------------------------------------------------
  describe('Non-rate-limited routes', () => {
    it('GET / (health) should never return 429', async () => {
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
    it('POST /api/payment/payment/process shares the payment limiter', async () => {
      // Payment counter is already over 30 — a different sub-route under
      // the same mount point should also be rejected.
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
