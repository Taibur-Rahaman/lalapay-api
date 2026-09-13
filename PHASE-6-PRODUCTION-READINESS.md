# Phase 6 — Real Payment Production Readiness

## Implemented in code

- Provider HTTP timeout: 15 seconds.
- Provider retry policy: up to 3 attempts with exponential backoff for transient HTTP failures (408/425/429/5xx).
- bKash token concurrency serialization and expiry-aware caching remain enabled.
- Payment amount and currency are verified against the local transaction before SUCCESS.
- Provider payment/reference IDs are protected by unique database indexes.
- SUCCESS is terminal: callbacks/reconciliation cannot downgrade a successful transaction.
- Duplicate callbacks are safe because status transitions are conditional and provider IDs are unique.
- Payment-link expiry is enforced before checkout creation.
- Pending/initiated transactions older than 2 minutes are eligible for reconciliation.
- Reconciliation queries bKash/Nagad provider status, validates amount/currency, updates recoverable transactions, and records mismatches.
- Transaction audit trail is database-triggered for creation, status changes, and provider-reference changes.
- Reconciliation runs and mismatches are persisted for operational review.
- Correlation starts from the transaction UUID and Vercel/API request ID; do not expose secrets in logs.
- Protected reconciliation endpoint: `POST/GET /api/reconcile` using `Authorization: Bearer $CRON_SECRET`.

## Still required before claiming LIVE production readiness

1. Fill real bKash merchant credentials and production callback URL.
2. Fill real Nagad merchant credentials/keys and production callback URL.
3. Run sandbox E2E for both providers.
4. Run production E2E with a controlled real merchant/test payment.
5. Confirm provider-specific callback authenticity/signature requirements with the live merchant account and gateway documentation. Nagad response signatures are verified in the provider adapter; bKash completion is verified server-to-server through execute/query.
6. Configure an external scheduler/monitor to call `/api/reconcile` every 5 minutes (or use a Vercel Cron plan that supports the desired frequency) with `CRON_SECRET`.
7. Configure production alerting for repeated reconciliation errors, amount/currency mismatches, and growing PENDING age.

Never mark Phase 6 fully green until real gateway credentials and controlled live E2E tests have passed.
