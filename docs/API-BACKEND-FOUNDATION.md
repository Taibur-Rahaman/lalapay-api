# LalaPay API Backend Foundation

This document defines the production backend contract for LalaPay. It is intentionally provider-neutral and does not contain credentials or undocumented provider endpoints.

## Payment lifecycle

`CREATED -> PENDING -> PROCESSING -> SUCCEEDED`

Failure/terminal states: `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`.

A terminal successful payment must never be moved back to a pending state.

## Core endpoints

- `GET /api/health`
- `POST /api/v1/payments`
- `GET /api/v1/payments/:id`
- `POST /api/v1/payments/:id/verify`
- `POST /api/v1/webhooks/bkash`
- `POST /api/v1/webhooks/nagad`

## Security requirements

- Provider credentials stay server-side and must be supplied through environment variables.
- Never trust browser-supplied amount or success state.
- Verify provider status and amount before marking a payment successful.
- Payment creation and verification must support idempotency.
- Webhooks must be authenticated where the provider supports signatures and must be replay-safe.
- Do not log secrets, authorization headers, private keys, or provider access tokens.
- Server-to-server integrations such as the future WHMCS module must use scoped authentication.

## Provider adapters

Implement `PaymentProvider` adapters for bKash and Nagad. Do not invent provider endpoints. Provider-specific operations should remain isolated so official sandbox/production contracts can be added without changing generic payment logic.

## Environment

Use `.env.example` for names only. Real values must be configured in the deployment environment, never committed to Git.

Expected categories include database configuration, application base URL, allowed origins, bKash configuration, Nagad configuration, and server-side authentication secrets.

## WHMCS integration boundary

WHMCS must communicate with LalaPay API only. It must not receive bKash/Nagad credentials or database credentials. The API must expose a scoped payment lookup/verification contract for the future WHMCS gateway.
