# Phase 2 — Core Payment Engine Hardening

This phase hardens the existing bKash + Nagad payment engine for production merchants.

## Implemented

### Idempotency
- `Idempotency-Key` remains mandatory on payment initiation.
- PostgreSQL uniqueness is scoped to `merchant_id + idempotency_key`.
- Existing transactions are returned for repeated keys.
- Vercel requests are serialized per idempotency key with a PostgreSQL advisory lock.
- Reusing a key for another provider returns `409` instead of creating another payment.
- Transaction rows inherit the merchant from the payment link.

### Transaction consistency
- Canonical states: `INITIATED`, `PENDING`, `SUCCESS`, `FAILED`.
- `SUCCESS` is terminal at the database layer.
- Stale callbacks cannot move `SUCCESS` back to `FAILED` or `PENDING`.
- Provider payment/transaction IDs are immutable once assigned.
- `updated_at` is refreshed on changes.
- `completed_at` is set once when a transaction becomes `SUCCESS`.
- A failed transaction may recover to `SUCCESS` after authoritative provider verification; this protects against transient/early failure callbacks.

### Callback safety
- Callbacks resolve transactions using provider transaction/payment identifiers.
- Amount and currency are verified before `SUCCESS`.
- Provider transaction IDs are protected by unique database indexes.
- Duplicate `SUCCESS` callbacks are harmless.
- Replayed stale callbacks cannot overwrite `SUCCESS`.
- Payment-link expiry is checked before payment initiation.
- Provider verification is used before successful completion rather than trusting a browser redirect alone.

### bKash
- Create, execute and query are server-side.
- Provider requests have a 15-second timeout.
- Access tokens are cached server-side.
- Concurrent token requests share a single in-flight token request instead of issuing duplicate token grants.
- Create/execute calls are not blindly retried because an uncertain payment creation/execution must not create a second provider transaction.

### Nagad
- Initialize/complete/redirect flow remains server-side.
- Server-side verification is required before `SUCCESS`.
- RSA encryption/decryption and signature verification are retained for the provider flow.
- Provider response data is verified before transaction completion.
- Provider timeout remains distinguishable from an authoritative payment failure.

## Verification gate

Before enabling live merchant traffic, verify:

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:smoke`
- [ ] two simultaneous requests with the same idempotency key create one transaction
- [ ] the same key cannot create a second provider transaction
- [ ] amount mismatch cannot become `SUCCESS`
- [ ] currency mismatch cannot become `SUCCESS`
- [ ] duplicate callbacks are harmless
- [ ] `SUCCESS` cannot become `FAILED`
- [ ] `SUCCESS` cannot become `PENDING`
- [ ] provider transaction IDs remain unique
- [ ] expired payment links cannot initiate payment
- [ ] bKash timeout/unknown results are reconciled before treating them as definitive failure
- [ ] Nagad verification succeeds before `SUCCESS`
- [ ] production environment variables are configured in Vercel
- [ ] production `/health` and `/health/ready` both pass

## Important production rule

A provider timeout is not proof of payment failure. When the provider result is uncertain, keep the transaction recoverable and verify/query the provider before allowing another payment attempt.
