-- 1. Create Enums if they don't exist
DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE normal_balance AS ENUM ('debit', 'credit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Ensure accounts table structure
-- (The table already exists, but we make sure columns match our needs)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Create transactions table if not exists (should already exist)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    reference_type TEXT, -- e.g. 'invoice', 'payment', 'expense'
    reference_id UUID,   -- e.g. invoice_id
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    UNIQUE(reference_type, reference_id)
);

-- 4. Create ledger_entries table if not exists (should already exist)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    business_id UUID NOT NULL REFERENCES businesses(id),
    amount DECIMAL(19,4) NOT NULL, -- positive for both debit and credit
    entry_type TEXT CHECK (entry_type IN ('debit', 'credit')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create transaction_reversals if not exists
CREATE TABLE IF NOT EXISTS transaction_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_transaction_id UUID NOT NULL REFERENCES transactions(id),
    reversal_transaction_id UUID NOT NULL REFERENCES transactions(id),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_business_id ON ledger_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_business_id ON transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_accounts_business_id ON accounts(business_id);

-- 7. Balance Check Trigger
CREATE OR REPLACE FUNCTION check_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    debit_sum DECIMAL(19,4);
    credit_sum DECIMAL(19,4);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO debit_sum FROM ledger_entries WHERE transaction_id = NEW.transaction_id AND entry_type = 'debit';
    SELECT COALESCE(SUM(amount), 0) INTO credit_sum FROM ledger_entries WHERE transaction_id = NEW.transaction_id AND entry_type = 'credit';

    IF debit_sum != credit_sum THEN
        RAISE EXCEPTION 'Transaction is not balanced: Debits (%) != Credits (%)', debit_sum, credit_sum;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- We use a CONSTRAINT TRIGGER so it only fires at the end of the SQL transaction (DEFERRED)
DROP TRIGGER IF EXISTS trigger_check_balance ON ledger_entries;
CREATE CONSTRAINT TRIGGER trigger_check_balance
AFTER INSERT OR UPDATE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_transaction_balance();

-- 8. Seeding Default Accounts for all businesses
DO $$
DECLARE
    biz RECORD;
BEGIN
    FOR biz IN SELECT id FROM businesses LOOP
        -- Bank
        INSERT INTO accounts (business_id, code, name, type, normal_balance, is_system)
        SELECT biz.id, '1000', 'Bank', 'asset', 'debit', true
        WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE business_id = biz.id AND code = '1000');

        -- Accounts Receivable
        INSERT INTO accounts (business_id, code, name, type, normal_balance, is_system)
        SELECT biz.id, '1100', 'Accounts Receivable', 'asset', 'debit', true
        WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE business_id = biz.id AND code = '1100');

        -- Sales Revenue
        INSERT INTO accounts (business_id, code, name, type, normal_balance, is_system)
        SELECT biz.id, '4000', 'Sales Revenue', 'revenue', 'credit', true
        WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE business_id = biz.id AND code = '4000');

        -- Operating Expenses
        INSERT INTO accounts (business_id, code, name, type, normal_balance, is_system)
        SELECT biz.id, '5000', 'Operating Expenses', 'expense', 'debit', true
        WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE business_id = biz.id AND code = '5000');

        -- VAT Payable (Liability)
        INSERT INTO accounts (business_id, code, name, type, normal_balance, is_system)
        SELECT biz.id, '2100', 'VAT Payable', 'liability', 'credit', true
        WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE business_id = biz.id AND code = '2100');
    END LOOP;
END $$;
