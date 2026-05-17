-- ============================================================
-- Zande Settings Migration
-- Adds contact info, invoicing defaults, and tax details to the businesses table.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- 1. Contact fields
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Financial & Tax details
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tax_id               TEXT,
  ADD COLUMN IF NOT EXISTS logo_url             TEXT,
  ADD COLUMN IF NOT EXISTS is_vat_registered    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS financial_year_end   DATE;

-- 3. Invoicing defaults
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS invoice_prefix       TEXT    NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS payment_terms_days   INT     NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS invoice_footer_note  TEXT    NOT NULL DEFAULT 'Thank you for your business.';

-- 4. Reload PostgREST schema cache
-- This is crucial to fix "Could not find the column in the schema cache" errors.
NOTIFY pgrst, 'reload schema';

-- 5. Verification (run after migration)
-- SELECT id, name, tax_id, is_vat_registered, financial_year_end, invoice_prefix 
-- FROM businesses LIMIT 5;
