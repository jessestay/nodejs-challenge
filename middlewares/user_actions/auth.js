const jwt = require('jsonwebtoken');
const User = require('../../models/userModel');
const ErrorHandler = require('../../utils/errorHandler');
const asyncErrorHandler = require('../helpers/asyncErrorHandler');
const { HTTP_STATUS } = require('../../config/constants');

const isAuthenticatedUser = asyncErrorHandler(async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Please log in to access this resource',
    });
  }

  if (!process.env.JWT_SECRET) {
    return next(new ErrorHandler('Server configuration error', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id);
  if (!user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'User no longer exists. Please log in again.',
    });
  }
  req.user = user;
  next();
});

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated',
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ErrorHandler(`Role '${req.user.role}' is not allowed to access this resource`, HTTP_STATUS.FORBIDDEN));
    }
    next();
  };
}

module.exports = {
  isAuthenticatedUser,
  authorizeRoles,
};
