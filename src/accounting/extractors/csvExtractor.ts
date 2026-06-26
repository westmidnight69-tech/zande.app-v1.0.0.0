import { parse } from 'csv-parse/browser/esm/sync';
import type { ExtractedStatement, RawExtractedTransaction } from './types';

export async function parseCsvStatement(file: File): Promise<ExtractedStatement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = String(e.target?.result || '');
        
        // Use csv-parse to handle edge cases like quoted fields with commas
        const records = parse(data, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true
        }) as any[];

        if (!records || records.length === 0) {
          throw new Error('The CSV file is empty or could not be parsed.');
        }

        const rows: RawExtractedTransaction[] = [];
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        for (const row of records) {
          // Identify keys dynamically in case of case-insensitivity
          const keys = Object.keys(row);
          const getVal = (possibleKeys: string[]) => {
            const key = keys.find(k => possibleKeys.includes(k.toLowerCase()));
            return key ? row[key] : undefined;
          };

          const rawDate = getVal(['date', 'transaction date', 'posting date', 'post date', 'transaction_date']);
          const rawDescription = getVal(['description', 'narrative', 'details', 'memo', 'payee']);
          const rawReference = getVal(['reference', 'ref number', 'ref', 'reference number', 'reference_number']) || '';
          
          let debit = 0;
          let credit = 0;

          const rawDebit = getVal(['debit', 'paid out', 'withdrawal']);
          const rawCredit = getVal(['credit', 'paid in', 'deposit']);
          const rawAmount = getVal(['amount']);

          if (rawDebit) debit = Math.abs(parseFloat(rawDebit)) || 0;
          if (rawCredit) credit = Math.abs(parseFloat(rawCredit)) || 0;

          if (rawAmount) {
            const parsedAmt = parseFloat(rawAmount);
            if (parsedAmt < 0) {
              debit = Math.abs(parsedAmt);
            } else {
              credit = parsedAmt;
            }
          }

          const balance = parseFloat(getVal(['balance']) || '0') || 0;

          if (rawDate && rawDescription && (debit > 0 || credit > 0)) {
            let parsedDate = new Date(rawDate);

            if (isNaN(parsedDate.getTime())) {
              // Try DD/MM/YYYY or DD-MM-YYYY
              const parts = rawDate.split(/[-/]/);
              if (parts.length === 3) {
                 // assume DD/MM/YYYY
                 parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
              }
              if (isNaN(parsedDate.getTime())) continue;
            }

            const dateStr = parsedDate.toISOString().split('T')[0];
            if (!minDate || parsedDate < minDate) minDate = parsedDate;
            if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;

            rows.push({
              transaction_date: dateStr,
              description: String(rawDescription).trim(),
              reference_number: String(rawReference).trim(),
              debit,
              credit,
              balance
            });
          }
        }

        if (rows.length === 0) {
          throw new Error('No valid transaction rows could be matched. Check CSV column headers.');
        }

        // Sort chronologically
        rows.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());

        const openingBalance = rows[0].balance ? rows[0].balance - (rows[0].credit - rows[0].debit) : undefined;
        const closingBalance = rows[rows.length - 1].balance || undefined;

        resolve({
          rows,
          openingBalance,
          closingBalance,
          startDate: minDate ? minDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          endDate: maxDate ? maxDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
}
