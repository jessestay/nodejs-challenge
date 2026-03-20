/**
 * Wraps async route handlers so thrown errors and rejections are passed to next().
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
module.exports.asyncErrorHandler = asyncHandler; // backward compatibility
