-- 1. Rename bank_statement_imports to bank_statements
DROP TABLE IF EXISTS bank_statements CASCADE;
ALTER TABLE bank_statement_imports RENAME TO bank_statements;

ALTER TABLE bank_statements
  RENAME COLUMN statement_start_date TO statement_period_start;
ALTER TABLE bank_statements
  RENAME COLUMN statement_end_date TO statement_period_end;
ALTER TABLE bank_statements
  RENAME COLUMN file_name TO source_file_url;
ALTER TABLE bank_statements
  RENAME COLUMN status TO processing_status;
ALTER TABLE bank_statements
  ADD COLUMN file_type text;

-- 2. Update bank_transactions
ALTER TABLE bank_transactions
  DROP COLUMN IF EXISTS import_source,
  DROP COLUMN IF EXISTS direction,
  DROP COLUMN IF EXISTS merchant,
  DROP COLUMN IF EXISTS raw_description,
  DROP COLUMN IF EXISTS recon_status,
  DROP COLUMN IF EXISTS recon_confidence,
  DROP COLUMN IF EXISTS is_duplicate,
  DROP COLUMN IF EXISTS hash;

ALTER TABLE bank_transactions
  RENAME COLUMN balance_after TO running_balance;
  
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS debit numeric,
  ADD COLUMN IF NOT EXISTS credit numeric,
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS normalized_description text,
  ADD COLUMN IF NOT EXISTS transaction_hash text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS reconciliation_status text;

-- 3. Rename reconciliation_matches to transaction_matches
ALTER TABLE reconciliation_matches RENAME TO transaction_matches;
ALTER TABLE transaction_matches
  RENAME COLUMN clearing_entry_id TO source_record_id;
ALTER TABLE transaction_matches
  RENAME COLUMN match_type TO source_type;
ALTER TABLE transaction_matches
  RENAME COLUMN confirmed_by TO approved_by;
ALTER TABLE transaction_matches
  RENAME COLUMN confirmed_at TO approved_at;
ALTER TABLE transaction_matches
  ADD COLUMN IF NOT EXISTS match_reason text;

-- 4. Rename bank_reconciliations to reconciliation_audit_log
ALTER TABLE bank_reconciliations RENAME TO reconciliation_audit_log;
ALTER TABLE reconciliation_audit_log
  RENAME COLUMN matched_by TO user_id;
ALTER TABLE reconciliation_audit_log
  RENAME COLUMN approved_at TO timestamp;
ALTER TABLE reconciliation_audit_log
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS old_value text,
  ADD COLUMN IF NOT EXISTS new_value text;
