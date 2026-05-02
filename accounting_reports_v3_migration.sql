-- ============================================================
-- Zande Accounting Engine v3 Migration
-- Adds required columns for the new reporting suite to prevent failures.
-- ============================================================

-- 1. Add missing columns to expenses table
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS merchant TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(19,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount DECIMAL(19,4),
  ADD COLUMN IF NOT EXISTS vat_claimable BOOLEAN DEFAULT false;

-- 2. Backfill expenses (calculate net_amount for legacy data)
UPDATE expenses
  SET net_amount = amount - COALESCE(vat_amount, 0)
  WHERE net_amount IS NULL;

-- 3. Add tax_point_date to invoices (if not already there)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_point_date DATE;

-- 4. Backfill tax_point_date
UPDATE invoices
  SET tax_point_date = issue_date::DATE
  WHERE tax_point_date IS NULL;
