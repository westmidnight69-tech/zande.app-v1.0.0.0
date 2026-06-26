import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedStatement, RawExtractedTransaction } from './types';

// Set worker source for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export async function parsePdfStatement(file: File): Promise<ExtractedStatement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }

        // Extremely basic text parsing - usually requires OCR or complex tabular parsing 
        // depending on the exact PDF format of the bank.
        // For production, we typically use an external service (like Textract/Google Vision) 
        // or a strict Regex parser per bank format.
        
        // As a fallback placeholder:
        console.warn('PDF Parsing: Native text extraction is basic. Needs bank-specific formatting templates.');

        // Let's attempt a generic regex pattern for Date | Desc | Ref | Amount | Balance
        const rows: RawExtractedTransaction[] = [];
        
        // Example Regex for Date (DD/MM/YYYY), Desc, Amount (1,234.56)
        // This is purely heuristic and will likely fail on complex real-world PDFs without bank-specific templates.
        const txRegex = /(\d{2}[-/]\d{2}[-/]\d{4})\s+(.+?)\s+(-?[\d,]+\.\d{2})/g;
        
        let match;
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        while ((match = txRegex.exec(fullText)) !== null) {
          const rawDate = match[1];
          const desc = match[2].trim();
          const amtStr = match[3].replace(/,/g, '');
          const amount = parseFloat(amtStr);
          
          let debit = 0;
          let credit = 0;
          
          if (amount < 0) {
            debit = Math.abs(amount);
          } else {
            credit = amount;
          }

          let parsedDate = new Date(rawDate.split(/[-/]/).reverse().join('-')); // assuming DD/MM/YYYY -> YYYY-MM-DD
          if (isNaN(parsedDate.getTime())) continue;

          const dateStr = parsedDate.toISOString().split('T')[0];
          if (!minDate || parsedDate < minDate) minDate = parsedDate;
          if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;

          rows.push({
            transaction_date: dateStr,
            description: desc,
            debit,
            credit,
            balance: 0 // Cannot easily deduce balance from simple regex
          });
        }

        if (rows.length === 0) {
          throw new Error('Could not automatically parse transactions from this PDF. Please verify format or use CSV/Excel.');
        }

        resolve({
          rows,
          startDate: minDate ? minDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          endDate: maxDate ? maxDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        });

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}
