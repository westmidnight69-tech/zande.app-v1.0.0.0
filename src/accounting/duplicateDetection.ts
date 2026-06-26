import { supabase } from '../lib/supabase';
import type { NormalizedTransaction } from './normalizationEngine';

export interface DuplicateCheckResult {
  transaction: NormalizedTransaction;
  isDuplicate: boolean;
  duplicateLevel: 0 | 1 | 2 | 3;
  confidence: number;
  reason?: string;
}

/**
 * Checks a batch of normalized transactions against the database for duplicates.
 * 
 * Levels:
 * Level 1: Exact hash match. Confidence 100%. (Reject)
 * Level 2: Same date, same amount, similar description. Confidence 95%. (Reject)
 * Level 3: Amount ± 1 day, similar description. Confidence 80%. (Flag for review)
 */
export async function detectDuplicates(
  businessId: string,
  bankAccountId: string,
  transactions: NormalizedTransaction[]
): Promise<{
  clean: DuplicateCheckResult[];
  duplicates: DuplicateCheckResult[];
  flagged: DuplicateCheckResult[];
}> {
  // 1. Fetch recent transactions for this bank account to check against
  // We fetch last 60 days to cover ± 1 day checks safely
  const minDate = new Date(Math.min(...transactions.map(t => new Date(t.date).getTime())));
  minDate.setDate(minDate.getDate() - 30); // look back extra 30 days
  
  const { data: existingTxs, error } = await supabase
    .from('bank_transactions')
    .select('id, transaction_hash, transaction_date, amount, normalized_description')
    .eq('business_id', businessId)
    .eq('bank_account_id', bankAccountId)
    .gte('transaction_date', minDate.toISOString().split('T')[0]);

  if (error) throw new Error('Failed to fetch existing transactions for duplicate detection.');

  const existingHashes = new Set(existingTxs?.map(t => t.transaction_hash) || []);

  const results: DuplicateCheckResult[] = [];

  for (const tx of transactions) {
    // Level 1: Exact Hash Match
    if (existingHashes.has(tx.transaction_hash)) {
      results.push({
        transaction: tx,
        isDuplicate: true,
        duplicateLevel: 1,
        confidence: 100,
        reason: 'Exact hash match'
      });
      continue;
    }

    // Heuristics for Level 2 & 3
    let matchedLevel2 = false;
    let matchedLevel3 = false;

    for (const ext of existingTxs || []) {
      // Check amount match
      if (Math.abs(ext.amount - tx.amount) < 0.01) {
        
        // Description similarity (very simple strict substring/inclusion for now)
        const isSimilarDesc = 
          ext.normalized_description.includes(tx.normalized_description) ||
          tx.normalized_description.includes(ext.normalized_description);

        if (isSimilarDesc) {
          const t1 = new Date(tx.date).getTime();
          const t2 = new Date(ext.transaction_date).getTime();
          const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);

          if (diffDays === 0) {
            // Level 2
            matchedLevel2 = true;
            break;
          } else if (diffDays <= 1) {
            // Level 3
            matchedLevel3 = true;
          }
        }
      }
    }

    if (matchedLevel2) {
      results.push({
        transaction: tx,
        isDuplicate: true,
        duplicateLevel: 2,
        confidence: 95,
        reason: 'Same date, amount, and similar description'
      });
    } else if (matchedLevel3) {
      results.push({
        transaction: tx,
        isDuplicate: false, // Flagged, but inserted as unmatched
        duplicateLevel: 3,
        confidence: 80,
        reason: 'Same amount, similar description, date within ± 1 day'
      });
    } else {
      results.push({
        transaction: tx,
        isDuplicate: false,
        duplicateLevel: 0,
        confidence: 0
      });
    }
  }

  return {
    clean: results.filter(r => r.duplicateLevel === 0),
    duplicates: results.filter(r => r.isDuplicate),
    flagged: results.filter(r => r.duplicateLevel === 3)
  };
}
