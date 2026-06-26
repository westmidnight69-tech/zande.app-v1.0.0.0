export interface CategorizationRule {
  id: string;
  keyword: string; // the string to match in normalized_description
  category_id: string; // The expense_category ID
  category_name: string; 
}

// In a real app, these rules would be fetched from a database table `bank_rules`.
// For the scope of this implementation, we simulate them or allow fetching.
const DEFAULT_RULES: CategorizationRule[] = [
  { id: '1', keyword: 'ENGEN', category_id: 'fuel', category_name: 'Fuel' },
  { id: '2', keyword: 'SHELL', category_id: 'fuel', category_name: 'Fuel' },
  { id: '3', keyword: 'BP', category_id: 'fuel', category_name: 'Fuel' },
  { id: '4', keyword: 'SPAR', category_id: 'groceries', category_name: 'Groceries' },
  { id: '5', keyword: 'CHECKERS', category_id: 'groceries', category_name: 'Groceries' },
  { id: '6', keyword: 'WOOLWORTHS', category_id: 'groceries', category_name: 'Groceries' },
  { id: '7', keyword: 'MAKRO', category_id: 'office', category_name: 'Office Supplies' },
  { id: '8', keyword: 'AWS', category_id: 'software', category_name: 'Software' },
  { id: '9', keyword: 'GOOGLE', category_id: 'software', category_name: 'Software' },
];

export interface CategorizationResult {
  categoryId: string;
  categoryName: string;
  confidence: number;
}

/**
 * Categorizes a normalized description based on predefined rules.
 */
export function categorizeTransaction(normalizedDesc: string, rules: CategorizationRule[] = DEFAULT_RULES): CategorizationResult | null {
  for (const rule of rules) {
    if (normalizedDesc.includes(rule.keyword)) {
      return {
        categoryId: rule.category_id,
        categoryName: rule.category_name,
        confidence: 100 // Exact rule match
      };
    }
  }

  // AI categorization fallback can be implemented here in the future
  return null;
}
