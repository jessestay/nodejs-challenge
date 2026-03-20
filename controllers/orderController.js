const asyncErrorHandler = require('../middlewares/helpers/asyncErrorHandler');
const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const ErrorHandler = require('../utils/errorHandler');
const sendEmail = require('../utils/sendEmail');
const { HTTP_STATUS, ORDER_STATUS } = require('../config/constants');

async function updateStock(productId, quantity) {
  const product = await Product.findById(productId);
  if (!product) return;
  product.stock = Math.max(0, (product.stock || 0) - quantity);
  await product.save({ validateBeforeSave: false });
}

exports.newOrder = asyncErrorHandler(async (req, res, next) => {
  const { shippingInfo, orderItems, paymentInfo, totalPrice } = req.body;

  const existingOrder = paymentInfo?.id
    ? await Order.findOne({ 'paymentInfo.id': paymentInfo.id })
    : null;
  if (existingOrder) {
    return next(new ErrorHandler('Order already placed for this payment', HTTP_STATUS.BAD_REQUEST));
  }

  const order = await Order.create({
    shippingInfo,
    orderItems,
    paymentInfo,
    totalPrice,
    paidAt: new Date(),
    user: req.user._id,
  });

  if (process.env.SENDGRID_ORDER_TEMPLATEID) {
    try {
      await sendEmail({
        email: req.user.email,
        templateId: process.env.SENDGRID_ORDER_TEMPLATEID,
        data: {
          name: req.user.name,
          shippingInfo,
          orderItems,
          totalPrice,
          oid: order._id,
        },
      });
    } catch (err) {
      // Log but do not fail the order
      console.warn('Order confirmation email failed:', err.message);
    }
  }

  res.status(HTTP_STATUS.CREATED).json({ success: true, order });
});

exports.getSingleOrderDetails = asyncErrorHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) {
    return next(new ErrorHandler('Order not found', HTTP_STATUS.NOT_FOUND));
  }
  res.status(HTTP_STATUS.OK).json({ success: true, order });
});

exports.myOrders = asyncErrorHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.status(HTTP_STATUS.OK).json({ success: true, orders });
});

exports.getAllOrders = asyncErrorHandler(async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  const totalAmount = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  res.status(HTTP_STATUS.OK).json({
    success: true,
    orders,
    totalAmount,
  });
});

exports.updateOrder = asyncErrorHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new ErrorHandler('Order not found', HTTP_STATUS.NOT_FOUND));
  }
  if (order.orderStatus === ORDER_STATUS.DELIVERED) {
    return next(new ErrorHandler('Order already delivered', HTTP_STATUS.BAD_REQUEST));
  }

  const { status } = req.body;
  if (status === ORDER_STATUS.SHIPPED) {
    order.shippedAt = new Date();
    await Promise.all(
      order.orderItems.map((item) => updateStock(item.product, item.quantity))
    );
  }
  if (status === ORDER_STATUS.DELIVERED) {
    order.deliveredAt = new Date();
  }

  order.orderStatus = status;
  await order.save({ validateBeforeSave: false });
  res.status(HTTP_STATUS.OK).json({ success: true });
});

exports.deleteOrder = asyncErrorHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new ErrorHandler('Order not found', HTTP_STATUS.NOT_FOUND));
  }
  await Order.deleteOne({ _id: order._id });
  res.status(HTTP_STATUS.OK).json({ success: true });
});
