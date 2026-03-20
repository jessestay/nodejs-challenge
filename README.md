# Node.js Test Assessment Requirements

**Target level:** Senior  
**Scope:** Server-side API

This document defines test assessment requirements for the backend of this project. Use it to design, implement, and evaluate automated tests and to run senior-level technical assessments.

---

## Project setup

**Prerequisites:** Node.js 18+

1. **Install dependencies**

   ```bash
   npm install
   ```


2. **Run the server**

   ```bash
   npm start
   ```

   Or with auto-reload:

   ```bash
   npm run dev
   ```

   **Quick check:** `GET http://localhost:3099/` or `GET http://localhost:3099/health` should return OK.

---

## Task: API Rate Limiting

**Objective:** Ensure the API is protected against abuse and DoS via request throttling on payment and order flows.

**Scope:** Rate limiting applies **only** to:

- **Payment routes** (`/api/payment/*`) — e.g. `POST /api/payment/payment/process`, `POST /api/payment/callback`, `GET /api/payment/payment/status/:id`.
- **Order routes** (`/api/order/*`) — e.g. `POST /api/order/order/new`, `GET /api/order/order/:id`, `GET /api/order/orders/me`, and admin order endpoints.

User, product, and other routes are **not** in scope for this rate-limiting requirement.

**Requirements:**

- **Per-route-group rate limiting for payment and order**
  - Define a maximum number of requests per window (e.g. per IP or per user) for all endpoints under `/api/payment` and `/api/order`.
  - Optionally use stricter limits for payment than for order (e.g. fewer requests per window for payment initiation/callback).
  - When the limit is exceeded, the API must respond with **429 Too Many Requests** and a clear message or retry-after hint where appropriate.

- **Assessment criteria:**
  - Requests to payment or order routes up to the limit receive **200** (or the expected success status).
  - The next request to the same route group within the same window receives **429**.
  - After the window resets (or after a defined cooldown), requests again receive success responses.
  - Rate limiting is applied consistently (e.g. by IP or by authenticated user, as designed).
  - Requests to non-limited routes (e.g. `/api/user/login`, `/api/product/*`) are **not** rate limited under this requirement.

**Suggested tests:**

- Hit a payment or order route N times; assert the (N+1)th request returns 429.
- Assert response body or headers indicate rate limit (e.g. message, `Retry-After`, or custom headers).
- Optionally: different limits for payment vs order; verify non–payment/order routes do not return 429 due to this limiter.

---

## Project Overview (for test setup)

### Tech stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT (cookie + Bearer)
- **Security:** Helmet, CORS, rate limiting (payment & order routes)

### Project structure

```
├── config/             # Database, env
├── controllers/        # Request handlers
├── middlewares/        # Auth, rate limit, error handling
├── models/             # Mongoose schemas
├── routes/             # API routes
├── utils/              # Helpers, error class
├── data/               # Static data (optional)
├── app.js              # Express app
├── index.js            # Entry point
├── .env.example
└── package.json
```

### API overview

| Area    | Base path      | Rate limited    |
|---------|----------------|-----------------|
| User    | `/api/user`    | No              |
| Product | `/api/product` | No              |
| Order   | `/api/order`   | Yes (60/15 min) |
| Payment | `/api/payment` | Yes (30/15 min) |

- **Health:** `GET /` and `GET /health`
- **Rate limiting:** Payment and order routes return **429 Too Many Requests** with `Retry-After` when exceeded. User and product routes are not rate limited.

---

## How to submit

Complete your work in the repository provided on **Codebie**. Use clear, professional commit messages, then push your changes to the branch indicated in your assignment (`git push origin <branch-name>`). Confirm on the platform that your submission is visible.
