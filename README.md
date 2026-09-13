# LalaPay API

Fastify + TypeScript payment API for LalaPay. The first release supports **bKash and Nagad only**.

## Production architecture

- **Runtime:** Node.js 24
- **API:** Fastify + TypeScript
- **Deployment:** Vercel
- **Database:** PostgreSQL (Supabase/Neon compatible)
- **Frontend:** `Taibur-Rahaman/LalaPay`
- **Payments:** bKash + Nagad

## Core features

- Merchant registration/login
- Signed merchant authentication tokens
- Merchant-owned payment links
- Hosted checkout integration
- bKash tokenized checkout flow
- Nagad initialize/complete/verify flow
- Idempotency keys for payment initiation
- Server-side payment verification before `SUCCESS`
- Merchant transaction history
- Payment-link activation/deactivation
- Merchant dashboard statistics
- Rate limiting and security headers
- PostgreSQL indexes for common merchant/payment queries

## API endpoints

### Public

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/payment-links/:id`
- `POST /api/v1/payment-links/:id/pay/bkash`
- `POST /api/v1/payment-links/:id/pay/nagad`
- `GET /api/v1/payments/:id`
- Provider callback endpoints

### Authenticated merchant endpoints

Send:

```http
Authorization: Bearer <merchant-token>
```

- `GET /api/v1/auth/me`
- `POST /api/v1/payment-links`
- `GET /api/v1/payment-links`
- `GET /api/v1/merchant/payment-links/:id`
- `PATCH /api/v1/merchant/payment-links/:id/status`
- `GET /api/v1/merchant/transactions`
- `GET /api/v1/merchant/stats`

Payment initiation also requires:

```http
Idempotency-Key: <unique-key>
```

## Environment variables

Copy `.env.example` into the deployment environment. Never commit real credentials.

Required for production:

- `DATABASE_URL`
- `JWT_SECRET` (at least 32 characters)
- `FRONTEND_URL`
- bKash merchant credentials and callback URL
- Nagad merchant credentials/keys and callback URL

Nagad production onboarding may also require callback URL and server/IP whitelisting according to the merchant account configuration.

## Vercel deployment

Import this repository into Vercel as a Node.js project. The repository already contains a Vercel configuration using the Node.js 24 runtime.

Set the API environment variables in Vercel under the appropriate Production/Preview environment. Do not put provider private keys or database credentials in GitHub.

After deployment, verify:

```text
https://<api-project>.vercel.app/health
```

The health endpoint reports whether the main production configuration categories are present; it does not perform a payment transaction.

## Local development

```bash
npm install
npm run dev
```

Typecheck/build:

```bash
npm run typecheck
npm run build
```

## CI

GitHub Actions runs Node.js 24, dependency installation, TypeScript typechecking, and the production build on pushes and pull requests to `main`.

## Security notes

- Never commit `.env` files containing secrets.
- Never expose merchant private keys to the frontend.
- Payment success must be determined by provider verification/callback handling, not by a client redirect alone.
- Keep `DATABASE_URL`, `JWT_SECRET`, bKash secrets, and Nagad private keys only in server-side environment variables.
