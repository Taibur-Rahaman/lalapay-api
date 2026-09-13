# Phase 8 — Operational Production Layer

## Implemented in repository

- Structured JSON production logger with timestamp, level, service, request/correlation ID and error stack.
- Lightweight error reporting hook (`reportError`) so runtime handlers can emit machine-searchable failures.
- Versioned migration metadata + runner (`src/migrations.ts`). `ensureDatabase()` remains the compatibility/bootstrap path until the full historical schema is converted into numbered migrations.
- PostgreSQL backup script: `scripts/db-backup.sh` using `pg_dump` custom format.
- PostgreSQL restore script: `scripts/db-restore.sh` using `pg_restore --clean --if-exists`.
- Concurrency/load smoke test: `scripts/load-test.mjs`.
- Scheduled GitHub dependency vulnerability scanning with `npm audit --audit-level=high`.

## Required infrastructure configuration

### Error + uptime monitoring
Use a production monitor against `/health/ready` with a 1-minute/5-minute interval and alert after 2 consecutive failures. Monitor HTTP 5xx rate and provider callback failures separately. Vercel runtime logs are the primary log sink; forward them to a retained log platform if longer retention is required.

### Database backups
Run `scripts/db-backup.sh` from a trusted scheduler at least daily, retain multiple generations, encrypt the backup store, and keep at least one copy outside the primary database provider. Never commit `.env`, dumps, or credentials.

### Restore test
At least monthly: restore the newest dump into an isolated database, run the API migration/bootstrap check, call `/health/ready`, and execute smoke tests. Record restore duration and the recovery point.

### Migrations
`src/migrations.ts` establishes version tracking. New schema changes must be added as numbered migrations and applied transactionally. Do not edit an already-applied migration. The legacy `ensureDatabase()` path should be removed only after the complete current schema has been converted to numbered migrations and production has been validated on the migration runner.

### Log retention
Keep searchable production logs for at least 30 days; retain security/payment audit records longer according to business/legal requirements. Do not log passwords, JWTs, cookies, provider secrets, private keys, or full customer payment credentials.

### Alerting
Minimum alerts: API uptime, HTTP 5xx spike, DB readiness failure, high DB pool wait/error rate, payment failure spike, reconciliation mismatch spike, stuck pending transactions, callback failures, and dependency/security alerts.

### Security audit
Before public launch: review authentication/session/CSRF, authorization boundaries, provider callbacks, SSRF/open redirects, SQL injection, secret exposure, rate limits, CORS, headers, dependency tree, backup access, and account recovery. Perform an external penetration test before high-volume production use.

### Secret rotation
Maintain an inventory and owner for `DATABASE_URL`, `JWT_SECRET`, bKash secrets, Nagad keys, Resend key, `CRON_SECRET`, and any monitoring keys. Rotate by provisioning the new value first, deploying, verifying health/payment callbacks, then revoking the old value. Never rotate by committing secrets to Git.

### Disaster recovery
Define RPO/RTO, database restore owner, provider credential recovery, DNS/Vercel recovery, incident contacts, and a rollback procedure. Keep the latest known-good deployment and database backup available. Test the runbook periodically.

### Rate-limit tuning
Start from observed production traffic rather than arbitrary limits. Monitor 429 responses and false positives. Keep stricter limits on login/recovery/payment initiation than public reads.

### Load and payment stress testing
Run `API_URL=https://... CONCURRENCY=20 REQUESTS=200 npm run test:load` against a non-production environment first. For payment stress tests, use provider sandbox/mock endpoints and unique idempotency keys; never generate uncontrolled real-money traffic. Validate duplicate requests, callback bursts, DB contention, provider timeouts, reconciliation, and recovery.

## Production exit criteria

Phase 8 is fully closed only when monitoring/alerts are configured, a real backup has been created, a restore has been successfully tested, all new schema changes use migrations, security/dependency scans are clean or accepted, secrets have documented rotation owners, DR has been tested, and load/payment stress results are recorded.
