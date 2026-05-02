-- ============================================================
-- Zande Accounting Engine v2 Migration
-- Adds tax_point_date to invoices for SARS VAT201 compliance.
-- tax_point_date = the date VAT becomes reportable to SARS.
-- Falls back to issue_date for all existing records.
-- ============================================================

-- 1. Add the column (nullable so existing rows are unaffected)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_point_date DATE;

-- 2. Backfill all existing invoices with issue_date as the default
UPDATE invoices
  SET tax_point_date = issue_date::DATE
  WHERE tax_point_date IS NULL;

-- 3. Create an index for fast VAT period queries
CREATE INDEX IF NOT EXISTS idx_invoices_tax_point_date
  ON invoices (business_id, tax_point_date)
  WHERE status NOT IN ('VOID', 'CANCELLED', 'DRAFT');

-- 4. Add a trigger to auto-populate tax_point_date from issue_date on INSERT
--    if the caller does not provide an explicit value.
CREATE OR REPLACE FUNCTION set_default_tax_point_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tax_point_date IS NULL THEN
    NEW.tax_point_date := NEW.issue_date::DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_default_tax_point_date ON invoices;
CREATE TRIGGER trg_default_tax_point_date
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_default_tax_point_date();

-- 5. Verification query (run after migration to confirm)
-- SELECT COUNT(*) FROM invoices WHERE tax_point_date IS NULL;
-- Should return 0.
