import * as XLSX from 'xlsx';
import type { ExtractedStatement, RawExtractedTransaction } from './types';

export async function parseXlsxStatement(file: File): Promise<ExtractedStatement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];

        if (json.length === 0) {
          throw new Error('The uploaded bank statement file is empty.');
        }

        const rows: RawExtractedTransaction[] = [];
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        for (const row of json) {
          // Dynamic Column Mapping
          const rawDate = row['Date'] || row['Transaction Date'] || row['Posting Date'] || row['Post Date'] || row['date'] || row['transaction_date'];
          const rawDescription = row['Description'] || row['Narrative'] || row['Details'] || row['Memo'] || row['Payee'] || row['description'];
          const rawReference = row['Reference'] || row['Ref Number'] || row['Ref'] || row['Reference Number'] || row['reference_number'] || '';
          
          let debit = 0;
          let credit = 0;

          // Detect debit/credit columns
          const rawDebit = row['Debit'] || row['Paid Out'] || row['Withdrawal'] || row['debit'];
          const rawCredit = row['Credit'] || row['Paid In'] || row['Deposit'] || row['credit'];
          const rawAmount = row['Amount'] || row['amount'];

          if (rawDebit !== undefined && rawDebit !== null) {
            debit = Math.abs(parseFloat(rawDebit)) || 0;
          }
          if (rawCredit !== undefined && rawCredit !== null) {
            credit = Math.abs(parseFloat(rawCredit)) || 0;
          }

          if (rawAmount !== undefined && rawAmount !== null) {
            const parsedAmt = parseFloat(rawAmount);
            if (parsedAmt < 0) {
              debit = Math.abs(parsedAmt);
            } else {
              credit = parsedAmt;
            }
          }

          const balance = parseFloat(row['Balance'] || row['balance'] || '0') || 0;

          if (rawDate && rawDescription && (debit > 0 || credit > 0)) {
            let parsedDate = new Date(rawDate);
            if (isNaN(parsedDate.getTime()) && typeof rawDate === 'number') {
              // Handle Excel date serial
              parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
            }

            if (isNaN(parsedDate.getTime())) {
              continue;
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
          throw new Error('No valid transaction rows could be matched. Check column headers.');
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
    reader.readAsBinaryString(file);
  });
}
