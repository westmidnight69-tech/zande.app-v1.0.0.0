import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../components/AuthProvider';
import { ledgerService } from '../lib/ledger';
import { format } from 'date-fns';
import { ShieldCheck, UploadCloud, CheckCircle, PlusCircle, BarChart2 } from 'lucide-react';
import { parseAndValidateBankStatement, matchBankTransactions, approveReconciliation } from '../accounting/bankReconciliation';
import type { MatchSuggestion } from '../accounting/bankReconciliation';
import ExpenseCreationModal from '../components/accounting/ExpenseCreationModal';

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  branch_code: string;
  is_designated_cash_account: boolean;
  current_balance: number;
}

export default function BankAccounts() {
  const { business, user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [activeAccount, setActiveAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState<number>(0);
  
  // Modal State
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch all bank accounts
      const { data: accountsData, error: accErr } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('business_id', business.id);

      if (accErr) throw accErr;
      
      let fetchedAccounts = accountsData || [];
      
      if (fetchedAccounts.length === 0) {
        // Seed default
        const { data: newAcc, error: seedErr } = await supabase
          .from('bank_accounts')
          .insert({
            business_id: business.id,
            bank_name: 'Primary Business Bank',
            account_name: 'Main Transactional Account',
            account_number_masked: '•••• 1234',
            account_number: '•••• 1234',
            account_type: 'Cheque',
            opening_balance: 0,
            current_balance: 0,
            is_designated_cash_account: true
          })
          .select()
          .single();
          
        if (seedErr) throw seedErr;
        fetchedAccounts = [newAcc];
      }
      
      setAccounts(fetchedAccounts);
      
      const currentActive = activeAccount ? fetchedAccounts.find(a => a.id === activeAccount.id) : fetchedAccounts[0];
      if (currentActive) {
        setActiveAccount(currentActive);
        
        // Fetch transactions
        const { data: txs, error: txsErr } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('bank_account_id', currentActive.id)
          .neq('reconciliation_status', 'approved')
          .order('transaction_date', { ascending: false });

        if (txsErr) throw txsErr;
        setTransactions(txs || []);

        if (txs && txs.length > 0) {
          const { data: mData, error: mErr } = await supabase
            .from('reconciliation_matches')
            .select('*')
            .in('bank_transaction_id', txs.map(t => t.id));

          if (mErr) throw mErr;
          setMatches(mData || []);
        } else {
          setMatches([]);
        }
        
        const balances = await ledgerService.getTrialBalance(business.id);
        const bankLedger = balances.find(b => b.code === '1000');
        setLedgerBalance(bankLedger?.balance || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load bank reconciliation data.');
    } finally {
      setLoading(false);
    }
  }, [business?.id, activeAccount?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeAccount || !business?.id) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const parsed = await parseAndValidateBankStatement(file, business.id, activeAccount.id);

      const { data: importHeader, error: importErr } = await supabase
        .from('bank_statement_imports')
        .insert({
          business_id: business.id,
          bank_account_id: activeAccount.id,
          file_name: file.name,
          statement_start_date: parsed.startDate,
          statement_end_date: parsed.endDate,
          opening_balance: parsed.openingBalance,
          closing_balance: parsed.closingBalance,
          uploaded_by: user?.id,
          status: 'processing'
        })
        .select()
        .single();

      if (importErr || !importHeader) throw new Error(`Import header creation failed: ${importErr?.message}`);

      const txsToInsert = parsed.rows.map(row => ({
        business_id: business.id,
        import_id: importHeader.id,
        bank_account_id: activeAccount.id,
        transaction_date: row.transaction_date,
        description: row.description,
        reference_number: row.reference_number,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
        transaction_hash: row.transaction_hash,
        reconciliation_status: 'unmatched'
      }));

      const { data: insertedTxs, error: insertErr } = await supabase
        .from('bank_transactions')
        .upsert(txsToInsert, { onConflict: 'business_id, transaction_hash' })
        .select();

      if (insertErr) throw new Error(`Transaction ingestion failed: ${insertErr.message}`);

      if (insertedTxs && insertedTxs.length > 0) {
        const matchSuggestions = await matchBankTransactions(business.id, insertedTxs.map(t => t.id));
        
        if (matchSuggestions.length > 0) {
          const suggestionsToInsert = matchSuggestions.map(s => ({
            business_id: business.id,
            bank_transaction_id: s.bankTransactionId,
            source_type: s.sourceType,
            source_id: s.sourceId,
            confidence: s.confidence,
            match_method: s.matchMethod,
            approved: false
          }));
          await supabase.from('reconciliation_matches').insert(suggestionsToInsert);
        }
      }

      await supabase
        .from('bank_statement_imports')
        .update({ status: 'completed' })
        .eq('id', importHeader.id);

      await supabase
        .from('bank_accounts')
        .update({ current_balance: parsed.closingBalance })
        .eq('id', activeAccount.id);

      setSuccess(`Import successful! ${parsed.rows.length} transactions processed.`);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Import failed.');
      setLoading(false);
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmMatch = async (txId: string, match: any) => {
    if (!business?.id) return;
    setLoading(true);
    setError(null);
    try {
      const formattedMatch: MatchSuggestion = {
        bankTransactionId: match.bank_transaction_id,
        sourceType: match.source_type,
        sourceId: match.source_id,
        confidence: match.confidence,
        matchMethod: match.match_method,
        description: match.description || 'System match suggestion'
      };

      await approveReconciliation(business.id, txId, formattedMatch, user?.id || '');
      setSuccess('Match successfully approved and posted to General Ledger.');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve match.');
      setLoading(false);
    }
  };

  const handleIgnore = async (txId: string) => {
    setLoading(true);
    try {
      await supabase
        .from('bank_transactions')
        .update({ reconciliation_status: 'ignored' })
        .eq('id', txId);
      
      setSuccess('Transaction marked as ignored.');
      fetchData();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const totalDeposits = transactions.reduce((sum, t) => sum + Number(t.credit || 0), 0);
  const totalWithdrawals = transactions.reduce((sum, t) => sum + Number(t.debit || 0), 0);
  const netMovement = totalDeposits - totalWithdrawals;

  const approvedCount = transactions.filter(t => t.reconciliation_status === 'approved').length;
  const totalCount = transactions.length;
  const reconciliationRate = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0;

  const bankCurrentBalance = activeAccount?.current_balance || 0;
  const balanceDifference = Math.abs(bankCurrentBalance - ledgerBalance);

  return (
    <div className="pb-24 lg:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between mb-8 overflow-hidden">
        <div>
          <h1 className="font-display text-4xl font-bold text-slate-100 tracking-tight">Banking</h1>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Financial Institutions & Reconciliation</p>
        </div>
      </header>

      {/* Bank Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {loading && accounts.length === 0 && Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border-subtle p-6 rounded-2xl h-48">
            <Skeleton className="w-24 h-4 mb-4" />
            <Skeleton className="w-full h-8 mb-6" />
          </div>
        ))}

        {accounts.map(account => (
          <div 
            key={account.id} 
            onClick={() => setActiveAccount(account)}
            className={`bg-surface border p-6 rounded-2xl relative overflow-hidden group hover:border-primary/50 transition-all cursor-pointer ${activeAccount?.id === account.id ? 'border-primary ring-1 ring-primary/20 shadow-lg shadow-primary/5' : 'border-border-subtle'}`}
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] font-bold mb-1">{account.bank_name}</p>
                <h3 className="font-display text-lg font-bold text-white uppercase tracking-tight">{account.account_type || 'Account'}</h3>
              </div>
              <div className="size-10 rounded-xl bg-surface-muted border border-border-subtle flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[20px]">account_balance_wallet</span>
              </div>
            </div>
            
            <div className="space-y-4">
               <div>
                 <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest leading-none mb-1.5">Account Number</p>
                 <p className="font-mono text-xl text-white tracking-[0.1em] font-medium">
                   {account.account_number?.replace(/.(?=.{4})/g, '•') || account.account_number}
                 </p>
               </div>
               
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-6">
                   <div>
                     <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-0.5">Branch</p>
                     <p className="font-mono text-xs text-slate-300 font-bold">{account.branch_code || '---'}</p>
                   </div>
                   {account.is_designated_cash_account && (
                     <div className="bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                       <p className="text-[8px] font-mono text-primary uppercase tracking-widest font-bold">Primary</p>
                     </div>
                   )}
                 </div>
                 
                 <div className="text-right">
                   <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mb-0.5">Balance</p>
                   <p className="font-mono text-sm text-emerald-400 font-bold">R{account.current_balance?.toLocaleString('en-ZA', { minimumFractionDigits: 2 }) || '0.00'}</p>
                 </div>
               </div>
            </div>
            
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
          </div>
        ))}
      </div>

      {activeAccount && (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          <div className="flex items-center justify-between mb-4 mt-12">
            <h2 className="font-display text-2xl font-bold text-white tracking-tight">Reconciliation: {activeAccount.bank_name}</h2>
          </div>

          {error && <p className="text-rose-500 text-xs font-mono bg-rose-500/10 px-4 py-2 rounded border border-rose-500/20">{error}</p>}
          {success && <p className="text-emerald-500 text-xs font-mono bg-emerald-500/10 px-4 py-2 rounded border border-emerald-500/20">{success}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`p-6 rounded-2xl border ${
              balanceDifference < 0.05
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-yellow-500/5 border-yellow-500/20'
            }`}>
              <div className="flex items-center gap-3">
                <ShieldCheck className={balanceDifference < 0.05 ? 'text-emerald-500' : 'text-yellow-500'} size={24} />
                <div>
                  <p className="text-[10px] font-mono text-slate-500 uppercase font-bold">Bank vs Ledger Balance Check</p>
                  <h4 className="text-sm font-bold text-slate-200 mt-1">
                    {balanceDifference < 0.05 
                      ? 'Balances In Sync' 
                      : `Discrepancy: R${balanceDifference.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                    }
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Bank Current Balance: R{bankCurrentBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} | Ledger Bank Account: R{ledgerBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-surface/30 border border-border-subtle p-6 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BarChart2 className="text-primary" size={24} />
                <div>
                  <p className="text-[10px] font-mono text-slate-500 uppercase font-bold">Statement Reconciliation Rate</p>
                  <h4 className="text-sm font-bold text-slate-200 mt-1">{reconciliationRate.toFixed(0)}% Complete</h4>
                  <div className="w-48 bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                    <div className="bg-primary h-full transition-all duration-500" style={{ width: `${reconciliationRate}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Total Deposits</p>
              <p className="text-xl font-bold font-mono text-emerald-400 mt-2">R{totalDeposits.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Total Withdrawals</p>
              <p className="text-xl font-bold font-mono text-slate-200 mt-2">R{totalWithdrawals.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Net Cash Flow</p>
              <p className={`text-xl font-bold font-mono mt-2 ${netMovement >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                R{netMovement.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-surface border border-border-subtle p-5 rounded-2xl">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Pending Rows</p>
              <p className="text-xl font-bold font-mono text-primary mt-2">{transactions.length}</p>
            </div>
          </div>

          <div className="bg-surface border border-border-subtle rounded-2xl p-8 text-center flex flex-col items-center justify-center border-dashed">
             <UploadCloud className="text-slate-500 mb-4" size={48} />
             <h3 className="text-lg font-bold text-slate-200 mb-2 font-display">Upload Bank Statement</h3>
             <p className="text-sm text-slate-500 mb-6 max-w-md">
               Import your bank statement in Excel (.xlsx, .xls, .csv) format. The ledger balance will only update once transactions are explicitly approved.
             </p>
             <label className="bg-primary text-black font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg hover:bg-primary/90 cursor-pointer transition-colors flex items-center gap-2">
               {loading ? 'Processing...' : 'Choose File'}
               <input 
                 type="file" 
                 className="hidden" 
                 accept=".xlsx, .xls, .csv" 
                 onChange={handleFileUpload} 
                 disabled={loading}
               />
             </label>
          </div>

          {transactions.length > 0 && (
            <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
               <div className="bg-surface-muted px-6 py-4 border-b border-border-subtle flex justify-between items-center">
                 <h3 className="font-display font-bold text-slate-100 text-sm">Unreconciled Bank Transactions</h3>
                 <span className="bg-primary/10 text-primary text-[10px] font-mono font-bold px-2 py-1 rounded">{transactions.length} PENDING</span>
               </div>
               
               <div className="divide-y divide-border-subtle/30 max-h-[600px] overflow-y-auto no-scrollbar">
                 {transactions.map((tx) => {
                   const match = matches.find(m => m.bank_transaction_id === tx.id);

                   return (
                     <div key={tx.id} className="p-6 hover:bg-surface/50 transition-colors">
                       <div className="flex justify-between items-start mb-3">
                         <div>
                           <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{format(new Date(tx.transaction_date), 'dd MMM yyyy')}</span>
                           <p className="text-sm font-bold text-slate-200 mt-1">{tx.description}</p>
                           {tx.reference_number && (
                             <p className="text-[10px] font-mono text-slate-500 mt-0.5">Ref: {tx.reference_number}</p>
                           )}
                         </div>
                         <div className={`text-right font-mono font-bold text-sm ${tx.credit > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                           {tx.credit > 0 
                             ? `+R${Number(tx.credit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` 
                             : `-R${Number(tx.debit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                           }
                         </div>
                       </div>
                       
                       <div className="mt-4 pt-4 border-t border-border-subtle/30 flex items-center justify-between flex-wrap gap-4">
                          {match ? (
                            <div className="flex-1 min-w-[280px] flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-xl">
                               <div className="flex items-center gap-3">
                                 <CheckCircle className="text-emerald-500 flex-shrink-0" size={18} />
                                 <div>
                                   <p className="text-[9px] text-emerald-500/70 uppercase font-mono font-bold mb-0.5">
                                     Suggested Match ({match.confidence}%)
                                   </p>
                                   <p className="text-xs text-emerald-400 font-bold">{match.source_type === 'invoice' ? 'Invoice Match' : 'Expense Match'}</p>
                                 </div>
                               </div>
                               <button 
                                 onClick={() => handleConfirmMatch(tx.id, match)}
                                 disabled={loading}
                                 className="bg-emerald-500 text-black px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                               >
                                 Confirm Match
                               </button>
                            </div>
                          ) : (
                            <div className="flex-1 text-xs text-slate-500 font-mono italic">No automated match found.</div>
                          )}
                          
                          <div className="flex gap-2">
                            {tx.debit > 0 && (
                              <button 
                                onClick={() => {
                                  setSelectedTx(tx);
                                  setExpenseModalOpen(true);
                                }}
                                disabled={loading}
                                className="flex items-center gap-2 bg-surface-muted text-slate-300 border border-border-subtle hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                              >
                                <PlusCircle size={14} /> New Expense
                              </button>
                            )}
                            <button 
                              onClick={() => handleIgnore(tx.id)}
                              className="flex items-center gap-2 bg-surface-muted text-slate-500 border border-border-subtle hover:text-rose-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                            >
                              Ignore
                            </button>
                          </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

          {expenseModalOpen && selectedTx && business && (
            <ExpenseCreationModal
              isOpen={expenseModalOpen}
              onClose={() => {
                setExpenseModalOpen(false);
                setSelectedTx(null);
              }}
              transaction={selectedTx}
              businessId={business.id}
              onSuccess={() => {
                setSuccess('Expense created and matched successfully.');
                fetchData();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
