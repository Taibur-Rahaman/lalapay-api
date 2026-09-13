# Phase 7 — Merchant Platform

Implemented as a production-oriented API foundation on top of the existing cookie-session merchant authentication.

## Merchant account

- Business profile: `GET/PATCH /api/v1/merchant/business-profile`
- Business logo URL
- Business address
- Merchant phone
- Merchant payment configuration JSON
- KYC status: `GET/POST /api/v1/merchant/kyc`
- Verification/review history
- Account status fields for active/review/suspended/inactive states
- SuperAdmin merchant review/suspension endpoints

## Money management

- `GET /api/v1/merchant/balance`
- `GET /api/v1/merchant/ledger`
- `GET /api/v1/merchant/settlements`
- `GET/POST /api/v1/merchant/payouts`
- `GET /api/v1/merchant/refunds`
- `POST /api/v1/merchant/transactions/:id/refund`
- Partial refunds are capped by the remaining refundable transaction amount.
- Dispute storage is included for the investigation workflow.
- Ledger, settlement, payout, refund and dispute tables are merchant-scoped.

## Integrations

- `GET/POST /api/v1/merchant/webhooks`
- Webhook event subscriptions and delivery history tables
- HTTPS-only webhook URLs
- Signing secret generated once at webhook creation
- `GET /api/v1/merchant/webhook-deliveries`
- `GET/POST/DELETE /api/v1/merchant/api-keys...`
- API keys are hashed at rest and the plaintext key is returned only at creation.

## Admin

Configure `ADMIN_EMAIL` and `ADMIN_PASSWORD` in Vercel/server environment variables.

- `POST /api/v1/admin/login`
- `POST /api/v1/admin/logout`
- `GET /api/v1/admin/merchants`
- `POST /api/v1/admin/merchants/:id/suspend`
- `POST /api/v1/admin/merchants/:id/activate`
- `POST /api/v1/admin/merchants/:id/review`
- `GET /api/v1/admin/transactions`
- `GET /api/v1/admin/payment-links`
- `GET /api/v1/admin/refunds`
- `GET /api/v1/admin/settlements`
- `GET /api/v1/admin/audit-logs`
- `GET /api/v1/admin/health`

Admin authentication uses an HttpOnly `lalapay_admin` cookie and an 8-hour server-side session.

## Database

Phase 7 adds merchant profile fields and dedicated tables for KYC reviews, fee rules, ledger entries, settlements, payout requests, refunds, disputes, webhooks, webhook deliveries, API keys, admin sessions and audit logs. Initialization is idempotent and runs through the existing database bootstrap path.

## Important production controls

Set:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `WEBHOOK_ENCRYPTION_KEY` (reserved for encrypted webhook-secret storage in the next provider-worker hardening step)
- `PLATFORM_FEE_PERCENT` (default `0` until a commercial fee is explicitly configured)

Provider refunds, actual bank/mobile-wallet settlement execution, and chargeback network integration still require provider-specific credentials/APIs; the Phase 7 ledger and workflow APIs intentionally do not fake those external operations.
