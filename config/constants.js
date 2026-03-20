/**
 * Application constants. Use these instead of magic strings/numbers.
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

const ORDER_STATUS = {
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
};

const COOKIE_EXPIRE_DAYS = 5;
const PAGINATION_DEFAULT_PAGE_SIZE = 12;

module.exports = {
  HTTP_STATUS,
  ROLES,
  ORDER_STATUS,
  COOKIE_EXPIRE_DAYS,
  PAGINATION_DEFAULT_PAGE_SIZE,
};
