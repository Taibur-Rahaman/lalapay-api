# LalaPay API Security Checklist

## Required before production

- Set a random `JWT_SECRET` of at least 32 characters.
- Keep PostgreSQL, bKash, and Nagad credentials only in Vercel environment variables.
- Use HTTPS-only Vercel URLs for `FRONTEND_URL`, `BKASH_CALLBACK_URL`, and `NAGAD_CALLBACK_URL`.
- Configure the exact frontend origin in `FRONTEND_URL`; do not leave it broadly enabled in production.
- Configure the production database with SSL.
- Use separate sandbox/live provider credentials and callback URLs.
- Complete bKash/Nagad merchant callback and whitelist requirements before live testing.
- Never commit private keys, payment credentials, database URLs, or JWT secrets.

## Authentication

Merchant passwords are stored using Node.js `scrypt`. Auth tokens are HMAC-SHA256 signed and expire after seven days. Tokens must be sent using `Authorization: Bearer <token>`.

The frontend currently stores the token in browser local storage. For a higher-security deployment, migrate authentication to an HTTPS-only, Secure, SameSite cookie/session model before exposing the dashboard to untrusted devices.

## Payment safety

- Every payment initiation requires an `Idempotency-Key`.
- Provider callbacks must be verified server-side before a transaction becomes `SUCCESS`.
- Never trust a browser redirect as proof of payment.
- Keep provider transaction/reference IDs for reconciliation.
- Do not reuse provider credentials between development and production.

## Operational checks

1. `GET /health` returns `status: ok`.
2. Merchant registration and login work.
3. Authenticated payment-link creation works.
4. Public hosted payment page loads.
5. Repeating the same idempotency key does not create a second provider payment.
6. bKash callback/verification completes successfully in sandbox.
7. Nagad callback/verification completes successfully in sandbox.
8. Failed provider requests do not become successful transactions.
9. Expired/inactive links reject new payment attempts.
10. Merchant A cannot access Merchant B's payment links or transactions.
