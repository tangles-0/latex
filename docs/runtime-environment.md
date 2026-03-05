# Runtime Environment Contract

The app supports both local and AWS runtime settings.

## Core Variables

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `PASSWORD_RESET_TOKEN_TTL_MINUTES` (optional, defaults to `30`)
- `RESEND_API_KEY` (required for password reset email delivery)
- `ADMIN_BOOTSTRAP_TOKEN` (required only for one-time `/promote-admin` bootstrap)
- `STORAGE_BACKEND` (`local` or `s3`)
- `RUN_DB_MIGRATIONS_ON_STARTUP` (`true` only for local/dev smoke use)

## Database Variables

Use one of:

1. `DATABASE_URL`
2. `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`

The app builds a connection string from `PG*` when `DATABASE_URL` is not provided.

## S3 Storage Variables

- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT` (optional, for local S3-compatible testing only)

## Distributed Rate Limit Variables

- `RATE_LIMIT_BACKEND` (`memory` or `dynamodb`)
- `RATE_LIMIT_TABLE` (required when backend is `dynamodb`)
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_ATTEMPTS`

## Billing Variables (optional)

- `BILLING_ROLE_ARN` (role to assume for Cost Explorer reads)
- `BILLING_CE_REGION` (defaults to `us-east-1`)

## Environment Matrix

- Local Docker:
  - `STORAGE_BACKEND=local`
  - local Postgres container, `RUN_DB_MIGRATIONS_ON_STARTUP=true`
- Dev AWS:
  - `STORAGE_BACKEND=s3`
  - `PG*` from RDS secret/endpoint
  - `RATE_LIMIT_BACKEND=dynamodb`
  - `RUN_DB_MIGRATIONS_ON_STARTUP=false`
- Prod AWS:
  - same as dev AWS, stricter secret rotation and access controls

