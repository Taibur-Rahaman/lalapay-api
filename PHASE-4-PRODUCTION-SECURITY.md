# Phase 4 — Production security + merchant experience

Implemented for the Vercel API path.

## Authentication

- Login and registration now issue an HttpOnly `lalapay_session` cookie instead of exposing the auth token in the JSON response.
- Cookie uses `Secure` in production and `SameSite=Lax`.
- A separate `lalapay_csrf` cookie is paired with the session.
- Unsafe cookie-authenticated requests require `X-CSRF-Token` matching the CSRF cookie.
- Sessions are stored server-side with hashed token identifiers, expiry, last-seen timestamp and revocation state.
- Logout revokes the current session and clears both cookies.
- Password reset and password change revoke existing sessions.
- Password reset tokens are single-use and expire after 30 minutes.
- Email verification tokens are single-use and expire after 24 hours.
- Email delivery uses Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured.

## Merchant account

- `GET /api/v1/merchant/profile`
- `PATCH /api/v1/merchant/profile` — business name update
- `POST /api/v1/auth/change-password`
- `DELETE /api/v1/merchant/account` — safe deactivation rather than destructive deletion
- Profile exposes business name, email, status and verification state.

## Abuse controls

- Login, registration, password reset, verification and password-change endpoints have per-IP database-backed rate limits.
- Existing global Fastify rate limits remain active for normal routes.
- Request IDs are returned in `X-Request-ID`.
- Passwords, cookies, session tokens and provider secrets are not intentionally written to application logs by the new security path.
- Errors returned to clients use generic messages for authentication and recovery failures.
- Existing Zod validation remains in the main Fastify API; new security endpoints validate their own inputs before database operations.

## Required production environment

```text
JWT_SECRET=<32+ random characters>
FRONTEND_URL=https://your-frontend.example
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=verified-sender@example.com
COOKIE_DOMAIN=<optional shared parent domain>
```

`RESEND_API_KEY` is optional for deployment, but without a configured mail provider the system cannot actually deliver verification/reset emails.

## Frontend migration

The frontend must stop reading an auth token from localStorage. Use `credentials: 'include'` on API requests. For unsafe cookie-authenticated requests, first obtain the CSRF cookie and send its value as `X-CSRF-Token`.

The existing Bearer-token path remains available for compatibility with existing integrations.
