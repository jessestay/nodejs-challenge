/**
 * Custom error class for API errors. Use with next(err) for global error handler.
 */
class ErrorHandler extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ErrorHandler;
