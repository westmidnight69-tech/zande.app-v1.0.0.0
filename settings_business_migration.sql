-- ============================================================
-- Zande Settings Migration
-- Adds contact info and invoicing defaults to the businesses table.
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).
-- ============================================================

-- 1. Contact fields
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Invoicing defaults
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS invoice_prefix       TEXT    NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS payment_terms_days   INT     NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS invoice_footer_note  TEXT    NOT NULL DEFAULT 'Thank you for your business.';

-- 3. Verification (run after migration)
-- SELECT id, name, phone, email, invoice_prefix, payment_terms_days, invoice_footer_note
-- FROM businesses LIMIT 5;
