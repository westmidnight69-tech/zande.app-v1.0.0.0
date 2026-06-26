export interface RawExtractedTransaction {
  transaction_date: string | Date;
  description: string;
  reference_number?: string;
  debit: number;
  credit: number;
  balance?: number;
}

export interface ExtractedStatement {
  rows: RawExtractedTransaction[];
  openingBalance?: number;
  closingBalance?: number;
  startDate?: string | Date;
  endDate?: string | Date;
}
