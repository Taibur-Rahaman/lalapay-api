# LalaPay API Production Runbook

## Required environment

Set these in the Vercel project, never in Git:

- `NODE_ENV=production`
- `DATABASE_URL`
- `DATABASE_SSL=true`
- `DB_POOL_MAX=5`
- `FRONTEND_URL` = the exact LalaPay frontend Vercel URL
- `JWT_SECRET` = a random value of at least 32 characters
- bKash production/sandbox credentials and callback URL
- Nagad production/sandbox credentials and callback URL

## Provider callbacks

Use the deployed API URL:

- bKash: `/api/v1/payments/bkash/callback`
- Nagad: `/api/v1/payments/nagad/callback`

Provider dashboards must whitelist the exact HTTPS callback URL when required.

## Readiness

- `/health` is a liveness check and must not require a working database.
- `/health/ready` verifies database connectivity and returns HTTP 503 when the database is unavailable.

## Database

The API creates required tables/indexes on startup. PostgreSQL should use SSL in production. The transaction table has unique constraints for idempotency keys and provider payment/transaction identifiers to reduce duplicate payment records.

## Payment safety

1. Every checkout request must include an `Idempotency-Key`.
2. Payment links are rejected when inactive or expired.
3. Provider callbacks are verified server-side.
4. Provider amount and currency must match the stored transaction before SUCCESS.
5. A SUCCESS transaction cannot be moved backward by a later callback.
6. Provider payment and transaction IDs are unique at the database layer.

## Launch checklist

1. Deploy API.
2. Set database and authentication environment variables.
3. Set `FRONTEND_URL` to the deployed frontend.
4. Set bKash/Nagad credentials and exact callback URLs.
5. Confirm `/health` returns 200.
6. Confirm `/health/ready` returns 200 with the production database configured.
7. Deploy frontend with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_URL`.
8. Register a test merchant.
9. Create a low-value sandbox payment link.
10. Test bKash and Nagad separately.
11. Confirm callback redirects to the frontend success page.
12. Confirm the dashboard shows the final transaction state.
13. Review Vercel logs for errors without exposing secrets.
