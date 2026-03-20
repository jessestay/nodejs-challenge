const Product = require('../models/productModel');
const asyncErrorHandler = require('../middlewares/helpers/asyncErrorHandler');
const SearchFeatures = require('../utils/searchFeatures');
const ErrorHandler = require('../utils/errorHandler');
const cloudinary = require('cloudinary');
const { HTTP_STATUS, PAGINATION_DEFAULT_PAGE_SIZE } = require('../config/constants');

const hasCloudinary = !!(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_NAME);

exports.getAllProducts = asyncErrorHandler(async (req, res) => {
  const resultPerPage = Number(req.query.limit) || PAGINATION_DEFAULT_PAGE_SIZE;
  const productsCount = await Product.countDocuments();
  const searchFeature = new SearchFeatures(Product.find(), req.query).search().filter();
  let products = await searchFeature.query;
  const filteredProductsCount = products.length;
  searchFeature.pagination(resultPerPage);
  products = await searchFeature.query.clone();
  res.status(HTTP_STATUS.OK).json({
    success: true,
    products,
    productsCount,
    resultPerPage,
    filteredProductsCount,
  });
});

exports.getProducts = asyncErrorHandler(async (req, res) => {
  const products = await Product.find();
  res.status(HTTP_STATUS.OK).json({ success: true, products });
});

exports.getProductDetails = asyncErrorHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return next(new ErrorHandler('Product not found', HTTP_STATUS.NOT_FOUND));
  }
  res.status(HTTP_STATUS.OK).json({ success: true, product });
});

exports.getAdminProducts = asyncErrorHandler(async (req, res) => {
  const products = await Product.find();
  res.status(HTTP_STATUS.OK).json({ success: true, products });
});

exports.createProduct = asyncErrorHandler(async (req, res, next) => {
  const images = Array.isArray(req.body.images) ? req.body.images : [req.body.images].filter(Boolean);
  const imagesLink = [];
  if (hasCloudinary && images.length > 0) {
    for (const img of images) {
      const result = await cloudinary.v2.uploader.upload(img, { folder: 'products' });
      imagesLink.push({ public_id: result.public_id, url: result.secure_url });
    }
  }

  let brandLogo = {};
  if (hasCloudinary && req.body.logo) {
    const result = await cloudinary.v2.uploader.upload(req.body.logo, { folder: 'brands' });
    brandLogo = { public_id: result.public_id, url: result.secure_url };
  }

  const specs = (req.body.specifications || []).map((s) =>
    typeof s === 'string' ? JSON.parse(s) : s
  );

  const product = await Product.create({
    ...req.body,
    images: imagesLink.length ? imagesLink : req.body.images,
    brand: req.body.brandname
      ? { name: req.body.brandname, logo: brandLogo }
      : req.body.brand,
    specifications: specs,
    user: req.user.id,
  });
  res.status(HTTP_STATUS.CREATED).json({ success: true, product });
});

exports.updateProduct = asyncErrorHandler(async (req, res, next) => {
  let product = await Product.findById(req.params.id);
  if (!product) {
    return next(new ErrorHandler('Product not found', HTTP_STATUS.NOT_FOUND));
  }

  if (req.body.images !== undefined && hasCloudinary) {
    const images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
    for (const img of product.images || []) {
      if (img.public_id) await cloudinary.v2.uploader.destroy(img.public_id);
    }
    const imagesLink = [];
    for (const img of images) {
      const result = await cloudinary.v2.uploader.upload(img, { folder: 'products' });
      imagesLink.push({ public_id: result.public_id, url: result.secure_url });
    }
    req.body.images = imagesLink;
  }

  if (req.body.logo && hasCloudinary && product.brand?.logo?.public_id) {
    await cloudinary.v2.uploader.destroy(product.brand.logo.public_id);
    const result = await cloudinary.v2.uploader.upload(req.body.logo, { folder: 'brands' });
    req.body.brand = {
      name: req.body.brandname ?? product.brand?.name,
      logo: { public_id: result.public_id, url: result.secure_url },
    };
  }

  const specs = (req.body.specifications || []).map((s) =>
    typeof s === 'string' ? JSON.parse(s) : s
  );
  if (specs.length) req.body.specifications = specs;
  req.body.user = req.user.id;

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  res.status(HTTP_STATUS.OK).json({ success: true, product });
});

exports.deleteProduct = asyncErrorHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return next(new ErrorHandler('Product not found', HTTP_STATUS.NOT_FOUND));
  }
  if (hasCloudinary && product.images?.length) {
    for (const img of product.images) {
      if (img.public_id) await cloudinary.v2.uploader.destroy(img.public_id);
    }
  }
  await Product.deleteOne({ _id: product._id });
  res.status(HTTP_STATUS.OK).json({ success: true });
});

exports.createProductReview = asyncErrorHandler(async (req, res, next) => {
  const { rating, comment, productId } = req.body;
  const product = await Product.findById(productId);
  if (!product) {
    return next(new ErrorHandler('Product not found', HTTP_STATUS.NOT_FOUND));
  }

  const review = {
    user: req.user._id,
    name: req.user.name,
    rating: Number(rating),
    comment,
  };
  const existing = product.reviews.find(
    (r) => r.user.toString() === req.user._id.toString()
  );
  if (existing) {
    existing.rating = review.rating;
    existing.comment = review.comment;
  } else {
    product.reviews.push(review);
  }
  product.numOfReviews = product.reviews.length;
  product.ratings =
    product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length;
  await product.save({ validateBeforeSave: false });
  res.status(HTTP_STATUS.OK).json({ success: true });
});

exports.getProductReviews = asyncErrorHandler(async (req, res, next) => {
  const product = await Product.findById(req.query.id);
  if (!product) {
    return next(new ErrorHandler('Product not found', HTTP_STATUS.NOT_FOUND));
  }
  res.status(HTTP_STATUS.OK).json({ success: true, reviews: product.reviews || [] });
});

exports.deleteReview = asyncErrorHandler(async (req, res, next) => {
  const product = await Product.findById(req.query.productId);
  if (!product) {
    return next(new ErrorHandler('Product not found', HTTP_STATUS.NOT_FOUND));
  }
  const reviews = (product.reviews || []).filter(
    (r) => r._id.toString() !== req.query.id
  );
  const numOfReviews = reviews.length;
  const ratings = numOfReviews
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / numOfReviews
    : 0;
  await Product.findByIdAndUpdate(
    req.query.productId,
    { reviews, ratings, numOfReviews },
    { new: true, runValidators: true }
  );
  res.status(HTTP_STATUS.OK).json({ success: true });
});
