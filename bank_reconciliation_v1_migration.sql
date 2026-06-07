-- Bank Reconciliation V1 Migration

-- 1. bank_accounts
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    account_name TEXT,
    account_number_masked TEXT,
    opening_balance NUMERIC(15,2) DEFAULT 0.00,
    current_balance NUMERIC(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS & Policies for bank_accounts
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own business bank accounts"
ON public.bank_accounts
FOR ALL
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 2. bank_statement_imports
CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    statement_start_date DATE,
    statement_end_date DATE,
    opening_balance NUMERIC(15,2) DEFAULT 0.00,
    closing_balance NUMERIC(15,2) DEFAULT 0.00,
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'pending'
);

-- Enable RLS & Policies for bank_statement_imports
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own bank statement imports"
ON public.bank_statement_imports
FOR ALL
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 3. bank_transactions
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    import_id UUID NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    description TEXT NOT NULL,
    reference_number TEXT,
    debit NUMERIC(15,2) DEFAULT 0.00,
    credit NUMERIC(15,2) DEFAULT 0.00,
    balance NUMERIC(15,2),
    transaction_hash TEXT NOT NULL,
    reconciliation_status TEXT DEFAULT 'unmatched' CHECK (reconciliation_status IN ('unmatched', 'suggested', 'matched', 'approved', 'ignored')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (business_id, transaction_hash)
);

-- Enable RLS & Policies for bank_transactions
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own bank transactions"
ON public.bank_transactions
FOR ALL
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 4. reconciliation_matches
CREATE TABLE IF NOT EXISTS public.reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    bank_transaction_id UUID NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL, -- e.g. 'invoice', 'expense', 'payment'
    source_id UUID NOT NULL,
    confidence NUMERIC(5,2),
    match_method TEXT, -- e.g. 'auto', 'manual'
    approved BOOLEAN DEFAULT FALSE,
    matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS & Policies for reconciliation_matches
ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own reconciliation matches"
ON public.reconciliation_matches
FOR ALL
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 5. bank_reconciliations
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    bank_transaction_id UUID NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
    ledger_transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    matched_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- Enable RLS & Policies for bank_reconciliations
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own bank reconciliations"
ON public.bank_reconciliations
FOR ALL
TO authenticated
USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 6. Add Accounts Payable (Code 2000) for all businesses
DO $$
DECLARE
    biz RECORD;
BEGIN
    FOR biz IN SELECT id FROM public.businesses LOOP
        -- Accounts Payable (Liability)
        INSERT INTO public.accounts (business_id, code, name, type, normal_balance, is_system)
        SELECT biz.id, '2000', 'Accounts Payable', 'liability', 'credit', true
        WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE business_id = biz.id AND code = '2000');
    END LOOP;
END $$;
