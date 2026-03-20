const { HTTP_STATUS, COOKIE_EXPIRE_DAYS } = require('../config/constants');

const COOKIE_MAX_AGE_MS = COOKIE_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

function sendToken(user, statusCode, res) {
  const token = user.getJWTToken();
  const options = {
    expires: new Date(Date.now() + COOKIE_MAX_AGE_MS),
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  };

  res.status(statusCode).cookie('token', token, options).json({
    success: true,
    user,
    token,
  });
}

module.exports = sendToken;
