ALTER TABLE "users"
  ADD COLUMN "password_reset_token_hash" text,
  ADD COLUMN "password_reset_token_expires_at" timestamp;
