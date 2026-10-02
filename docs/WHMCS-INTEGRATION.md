# LalaPay WHMCS Integration

The WHMCS gateway communicates only with the LalaPay API. bKash/Nagad provider credentials remain on the LalaPay backend.

## Endpoints

- `POST /api/v1/integrations/whmcs/payments`
- `POST /api/v1/integrations/whmcs/payment-status`

Both endpoints require `Authorization: Bearer <WHMCS_API_KEY>`.

## Environment variables

Set these on the LalaPay API deployment:

- `WHMCS_MERCHANT_ID` — UUID of the LalaPay merchant that owns WHMCS payments.
- `WHMCS_API_KEY_SHA256` — SHA-256 hex digest of the raw WHMCS API key. Store the raw key only in WHMCS gateway configuration; never commit it.
- `FRONTEND_URL` — public LalaPay frontend URL used to construct checkout URLs.

Example for generating a digest locally:

```bash
printf '%s' 'your-long-random-whmcs-key' | shasum -a 256
```

## Create payment

`POST /api/v1/integrations/whmcs/payments`

Required header:

`Idempotency-Key: <unique-key-per-whmcs-invoice-payment>`

Body:

```json
{
  "invoiceId": "123",
  "amount": 1500,
  "currency": "BDT",
  "customer": {
    "name": "Customer Name",
    "email": "customer@example.com",
    "phone": "+8801XXXXXXXXX"
  }
}
```

The endpoint validates the amount/currency, creates a LalaPay payment link and an initial transaction record, and returns a hosted checkout URL. Reusing the same idempotency key with different payment data is rejected.

## Payment status

`POST /api/v1/integrations/whmcs/payment-status`

```json
{ "paymentId": "<public-lalapay-payment-id>" }
```

The lookup is scoped to the configured merchant. A successful transaction is reported as `SUCCEEDED`.

## Production notes

The WHMCS endpoints do not decide payment success from client input. Provider verification remains the source of truth. Configure real bKash/Nagad credentials only through server-side environment variables after the corresponding provider adapters have been tested with supported official APIs.
