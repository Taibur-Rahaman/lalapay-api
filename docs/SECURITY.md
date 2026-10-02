# LalaPay API Security Baseline

- No provider credentials, private keys, passwords or tokens belong in Git.
- Browser clients must never receive bKash/Nagad secrets.
- Payment amount and success status are server-authoritative.
- Payment creation and verification must be idempotent.
- Webhook events must be authenticated where supported and replay-protected.
- Provider transaction IDs must not be credited more than once.
- API errors must not expose stack traces or secret-bearing provider responses.
- Logs must redact credentials, authorization headers and private keys.
- Authenticated server-to-server integrations must be scoped to the owning merchant.
- Production deployment must use HTTPS and secure environment variables.

## Provider readiness

bKash and Nagad adapters must use their official documented API contracts. If credentials or an official contract are unavailable, the adapter must remain explicitly unavailable rather than returning a fabricated successful payment.
