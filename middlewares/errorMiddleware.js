const ErrorHandler = require('../utils/errorHandler');
const { HTTP_STATUS } = require('../config/constants');

/**
 * Global error handler for Express.
 * Sends consistent JSON error responses and avoids leaking internals in production.
 */
function errorMiddleware(err, req, res, next) {
  let statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal Server Error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    message = `Resource not found. Invalid: ${err.path}`;
    statusCode = HTTP_STATUS.BAD_REQUEST;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    message = `Duplicate value for: ${Object.keys(err.keyValue || {}).join(', ')}`;
    statusCode = HTTP_STATUS.BAD_REQUEST;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join('; ');
    statusCode = HTTP_STATUS.BAD_REQUEST;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token. Please log in again.';
    statusCode = HTTP_STATUS.UNAUTHORIZED;
  }
  if (err.name === 'TokenExpiredError') {
    message = 'Token expired. Please log in again.';
    statusCode = HTTP_STATUS.UNAUTHORIZED;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorMiddleware;
