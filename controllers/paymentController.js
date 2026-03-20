const crypto = require('crypto');
const https = require('https');
const asyncErrorHandler = require('../middlewares/helpers/asyncErrorHandler');
const paytm = require('paytmchecksum');
const Payment = require('../models/paymentModel');
const ErrorHandler = require('../utils/errorHandler');
const { HTTP_STATUS } = require('../config/constants');

const PAYTM_STATUS_HOST = process.env.PAYTM_ENV === 'production'
  ? 'securegw.paytm.in'
  : 'securegw-stage.paytm.in';

function generateOrderId() {
  if (typeof crypto.randomUUID === 'function') {
    return 'oid' + crypto.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return 'oid' + [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function fetchPaytmOrderStatus(orderId, mid, signature) {
  return new Promise((resolve, reject) => {
    const postBody = JSON.stringify({
      head: { signature },
      body: { mid, orderId },
    });
    const opts = {
      hostname: PAYTM_STATUS_HOST,
      port: 443,
      path: '/v3/order/status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postBody),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.body || parsed);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postBody);
    req.end();
  });
}

async function savePayment(data) {
  await Payment.create(data);
}

exports.processPayment = asyncErrorHandler(async (req, res, next) => {
  const { amount, email, phoneNo } = req.body;
  if (amount == null || !email) {
    return next(new ErrorHandler('Amount and email are required', HTTP_STATUS.BAD_REQUEST));
  }

  const merchantKey = process.env.PAYTM_MERCHANT_KEY;
  if (!merchantKey || !process.env.PAYTM_MID) {
    return next(new ErrorHandler('Payment gateway not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }

  const orderId = generateOrderId();
  const callbackUrl = `${req.protocol}://${req.get('host')}/api/payment/callback`;
  const params = {
    MID: process.env.PAYTM_MID,
    WEBSITE: process.env.PAYTM_WEBSITE,
    CHANNEL_ID: process.env.PAYTM_CHANNEL_ID,
    INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE,
    ORDER_ID: orderId,
    CUST_ID: process.env.PAYTM_CUST_ID || process.env.PAYTM_MID,
    TXN_AMOUNT: String(amount),
    CALLBACK_URL: callbackUrl,
    EMAIL: email,
    MOBILE_NO: phoneNo || '',
  };

  try {
    const checksum = await paytm.generateSignature(params, merchantKey);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      paytmParams: { ...params, CHECKSUMHASH: checksum },
    });
  } catch (err) {
    next(new ErrorHandler(err.message || 'Payment initiation failed', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }
});

exports.paytmResponse = asyncErrorHandler(async (req, res, next) => {
  const merchantKey = process.env.PAYTM_MERCHANT_KEY;
  if (!merchantKey) {
    return next(new ErrorHandler('Payment gateway not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR));
  }

  const checksumHash = req.body.CHECKSUMHASH;
  const bodyCopy = { ...req.body };
  delete bodyCopy.CHECKSUMHASH;

  const isValid = paytm.verifySignature(bodyCopy, merchantKey, checksumHash);
  if (!isValid) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Invalid checksum',
    });
  }

  const statusPayload = {
    body: { mid: req.body.MID, orderId: req.body.ORDERID },
  };
  const signature = await paytm.generateSignature(JSON.stringify(statusPayload.body), merchantKey);
  statusPayload.head = { signature };

  const body = await fetchPaytmOrderStatus(
    req.body.ORDERID,
    req.body.MID,
    signature
  );

  try {
    await savePayment(body);
  } catch (err) {
    console.warn('Payment record save failed:', err.message);
  }

  const redirectUrl = `${req.protocol}://${req.get('host')}/order/${req.body.ORDERID}`;
  res.redirect(redirectUrl);
});

exports.getPaymentStatus = asyncErrorHandler(async (req, res, next) => {
  const payment = await Payment.findOne({ orderId: req.params.id });
  if (!payment) {
    return next(new ErrorHandler('Payment not found', HTTP_STATUS.NOT_FOUND));
  }
  res.status(HTTP_STATUS.OK).json({
    success: true,
    txn: {
      id: payment.txnId,
      status: payment.resultInfo?.resultStatus,
    },
  });
});
