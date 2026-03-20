const checkRegion = require('../utils/checkRegion');
const asyncErrorHandler = require('./helpers/asyncErrorHandler');
const { HTTP_STATUS } = require('../config/constants');

const SKIP_PATHS = ['/', '/health'];

checkRegion({});

const regionMiddleware = asyncErrorHandler(async (req, res, next) => {
  if (SKIP_PATHS.includes(req.path)) return next();
  const allowed = await checkRegion(req);
  if (!allowed) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Access not allowed from your region',
    });
  }
  next();
});

module.exports = regionMiddleware;