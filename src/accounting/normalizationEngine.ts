export interface NormalizedTransaction {
  date: string; // ISO YYYY-MM-DD
  description: string;
  normalized_description: string;
  reference: string;
  debit: number;
  credit: number;
  amount: number; // positive = credit, negative = debit
  balance: number;
  transaction_hash: string;
}

/**
 * Normalizes description text by stripping special chars, extra whitespace, 
 * and removing common numeric identifiers to group similar merchants.
 */
export function normalizeDescription(rawDesc: string): string {
  if (!rawDesc) return '';
  
  // 1. Convert to uppercase
  let text = rawDesc.toUpperCase();
  
  // 2. Remove special characters (keep only alphanumeric and spaces)
  text = text.replace(/[^A-Z0-9\s]/g, ' ');
  
  // 3. Remove standalone numbers that might be branch codes (e.g. "ENGEN 1234 DURBAN" -> "ENGEN DURBAN")
  text = text.replace(/\b\d+\b/g, ' ');
  
  // 4. Remove duplicate whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Computes SHA256 hash
 */
export async function computeHash(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Processes a raw transaction into the standardized normalized format.
 */
export async function normalizeTransaction(
  bankAccountId: string,
  rawTx: any
): Promise<NormalizedTransaction> {
  const normDesc = normalizeDescription(rawTx.description);
  
  const debit = rawTx.debit || 0;
  const credit = rawTx.credit || 0;
  const amount = credit > 0 ? credit : -debit;
  const balance = rawTx.balance || 0;
  const reference = (rawTx.reference_number || '').trim();
  const date = rawTx.transaction_date;

  // SHA256(date + amount + normalized_description + bank_account)
  const hashInput = `${date}_${amount.toFixed(2)}_${normDesc}_${bankAccountId}`;
  const hash = await computeHash(hashInput);

  return {
    date,
    description: rawTx.description.trim(),
    normalized_description: normDesc,
    reference,
    debit,
    credit,
    amount,
    balance,
    transaction_hash: hash
  };
}
