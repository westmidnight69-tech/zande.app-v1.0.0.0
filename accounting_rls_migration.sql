-- ============================================================
-- Row Level Security (RLS) Migration
-- Ensures data isolation per business/user
-- ============================================================

-- 1. Enable RLS on all relevant tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to ensure clean slate (optional, but good for idempotency)
-- Suppress notices for missing policies using PL/pgSQL block
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('businesses', 'accounts', 'transactions', 'ledger_entries', 'transaction_reversals', 'invoices', 'expenses', 'expense_categories', 'payments', 'clients')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 3. Create Policies

-- Businesses: Users can only see and modify businesses they own
CREATE POLICY "Users can view their own businesses" 
ON businesses FOR SELECT 
USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own businesses" 
ON businesses FOR INSERT 
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own businesses" 
ON businesses FOR UPDATE 
USING (owner_id = auth.uid());

CREATE POLICY "Users can delete their own businesses" 
ON businesses FOR DELETE 
USING (owner_id = auth.uid());

-- Helper function to avoid repeating the subquery, can be useful for performance but a subquery is standard.
-- We will use the subquery approach for simplicity and reliability.

-- Accounts
CREATE POLICY "Users can manage accounts for their businesses" 
ON accounts FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Transactions
CREATE POLICY "Users can manage transactions for their businesses" 
ON transactions FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Ledger Entries
CREATE POLICY "Users can manage ledger entries for their businesses" 
ON ledger_entries FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Transaction Reversals
-- Relies on original_transaction_id. We need to join via transactions to check business_id.
CREATE POLICY "Users can manage transaction reversals for their businesses" 
ON transaction_reversals FOR ALL 
USING (
  original_transaction_id IN (
    SELECT id FROM transactions 
    WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())
  )
);

-- Invoices
CREATE POLICY "Users can manage invoices for their businesses" 
ON invoices FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Expenses
CREATE POLICY "Users can manage expenses for their businesses" 
ON expenses FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Expense Categories
CREATE POLICY "Users can manage expense categories for their businesses" 
ON expense_categories FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Payments
CREATE POLICY "Users can manage payments for their businesses" 
ON payments FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Clients
CREATE POLICY "Users can manage clients for their businesses" 
ON clients FOR ALL 
USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
