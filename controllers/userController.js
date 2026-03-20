const User = require('../models/userModel');
const asyncErrorHandler = require('../middlewares/helpers/asyncErrorHandler');
const sendToken = require('../utils/sendToken');
const ErrorHandler = require('../utils/errorHandler');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');
const cloudinary = require('cloudinary');
const { HTTP_STATUS, ROLES } = require('../config/constants');

exports.registerUser = asyncErrorHandler(async (req, res, next) => {
  const { name, email, gender, password } = req.body;

  let avatar = {};
  if (req.body.avatar && process.env.CLOUDINARY_API_KEY) {
    const myCloud = await cloudinary.v2.uploader.upload(req.body.avatar, {
      folder: 'avatars',
      width: 150,
      crop: 'scale',
    });
    avatar = { public_id: myCloud.public_id, url: myCloud.secure_url };
  }

  const user = await User.create({ name, email, gender, password, avatar });
  sendToken(user, HTTP_STATUS.CREATED, res);
});

exports.loginUser = asyncErrorHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ErrorHandler('Please provide email and password', HTTP_STATUS.BAD_REQUEST));
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return next(new ErrorHandler('Invalid email or password', HTTP_STATUS.UNAUTHORIZED));
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new ErrorHandler('Invalid email or password', HTTP_STATUS.UNAUTHORIZED));
  }

  sendToken(user, HTTP_STATUS.OK, res);
});

exports.logoutUser = asyncErrorHandler(async (req, res) => {
  res.cookie('token', null, {
    expires: new Date(Date.now()),
    httpOnly: true,
  });
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Logged out successfully',
  });
});

exports.getUserDetails = asyncErrorHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  res.status(HTTP_STATUS.OK).json({ success: true, user });
});

exports.forgotPassword = asyncErrorHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new ErrorHandler('User not found', HTTP_STATUS.NOT_FOUND));
  }

  const resetToken = await user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetPasswordUrl = `${req.protocol}://${req.get('host')}/api/user/password/reset/${resetToken}`;

  try {
    await sendEmail({
      email: user.email,
      templateId: process.env.SENDGRID_RESET_TEMPLATEID,
      data: { reset_url: resetPasswordUrl },
    });
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Password reset email sent to ${user.email}`,
    });
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ErrorHandler(err.message || 'Email could not be sent', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
});

exports.resetPassword = asyncErrorHandler(async (req, res, next) => {
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorHandler('Invalid or expired reset token', HTTP_STATUS.NOT_FOUND));
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  sendToken(user, HTTP_STATUS.OK, res);
});

exports.updatePassword = asyncErrorHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');
  const isMatch = await user.comparePassword(req.body.oldPassword);
  if (!isMatch) {
    return next(new ErrorHandler('Current password is incorrect', HTTP_STATUS.BAD_REQUEST));
  }
  user.password = req.body.newPassword;
  await user.save();
  sendToken(user, HTTP_STATUS.OK, res);
});

exports.updateProfile = asyncErrorHandler(async (req, res, next) => {
  const newData = { name: req.body.name, email: req.body.email };

  if (req.body.avatar && process.env.CLOUDINARY_API_KEY) {
    const user = await User.findById(req.user.id);
    if (user?.avatar?.public_id) {
      await cloudinary.v2.uploader.destroy(user.avatar.public_id);
    }
    const myCloud = await cloudinary.v2.uploader.upload(req.body.avatar, {
      folder: 'avatars',
      width: 150,
      crop: 'scale',
    });
    newData.avatar = { public_id: myCloud.public_id, url: myCloud.secure_url };
  }

  const user = await User.findByIdAndUpdate(req.user.id, newData, {
    new: true,
    runValidators: true,
  });
  res.status(HTTP_STATUS.OK).json({ success: true, user });
});

exports.getAllUsers = asyncErrorHandler(async (req, res) => {
  const users = await User.find();
  res.status(HTTP_STATUS.OK).json({ success: true, users });
});

exports.getSingleUser = asyncErrorHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new ErrorHandler(`User not found: ${req.params.id}`, HTTP_STATUS.NOT_FOUND));
  }
  res.status(HTTP_STATUS.OK).json({ success: true, user });
});

exports.updateUserRole = asyncErrorHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name, email: req.body.email, gender: req.body.gender, role: req.body.role },
    { new: true, runValidators: true }
  );
  if (!user) {
    return next(new ErrorHandler(`User not found: ${req.params.id}`, HTTP_STATUS.NOT_FOUND));
  }
  res.status(HTTP_STATUS.OK).json({ success: true, user });
});

exports.deleteUser = asyncErrorHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new ErrorHandler(`User not found: ${req.params.id}`, HTTP_STATUS.NOT_FOUND));
  }
  await User.deleteOne({ _id: user._id });
  res.status(HTTP_STATUS.OK).json({ success: true });
});
