const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config/constants');

/**
 * Window duration shared by both limiters (15 minutes in ms).
 */
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Builds the JSON body returned when a client exceeds its rate limit.
 */
function limitHandler(req, res) {
  res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
    success: false,
    message: 'Too many requests. Please try again later.',
  });
}

/**
 * Rate limiter for payment routes.
 * Stricter limit — 30 requests per 15-minute window per IP.
 */
const paymentLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 30,
  standardHeaders: true, // RateLimit-* headers (draft-6)
  legacyHeaders: true,   // X-RateLimit-* headers
  handler: limitHandler,
});

/**
 * Rate limiter for order routes.
 * 60 requests per 15-minute window per IP.
 */
const orderLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: true,
  handler: limitHandler,
});

module.exports = { paymentLimiter, orderLimiter };
