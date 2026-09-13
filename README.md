# LalaPay API

Backend payment engine for LalaPay. The first release targets **bKash and Nagad only**.

## Architecture direction

- Fastify + TypeScript
- PostgreSQL-ready persistence
- Provider adapters for bKash and Nagad
- Payment-link-first checkout
- Transaction verification before marking a payment successful
- Idempotent callbacks/webhooks
- Merchant API keys
- Test/live provider configuration
- WHMCS integration compatibility

## Reference behavior

The implementation is being designed from the observed ZiNiPay SMM and WHMCS module flows, while keeping LalaPay's codebase and branding independent. The ZiNiPay WHMCS module creates a payment through an API, redirects the customer to a hosted payment URL, then verifies the payment during callback before applying it to the invoice.

## Initial endpoint

`GET /health`

`POST /api/v1/payment-links` is currently a foundation endpoint. Persistence and real provider execution are added in subsequent phases.

## Never commit

- Provider secrets
- Private keys
- JWT secrets
- Production database credentials
