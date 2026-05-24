import DOMPurify from 'dompurify';

/**
 * Strips HTML tags and trims leading/trailing whitespace from a string.
 * @param input The raw user string.
 * @returns The sanitized, safe string.
 */
export function sanitizeString(input: string): string {
  if (!input) return input;
  
  // Trim the input
  let sanitized = input.trim();
  
  // Use DOMPurify to strip ALL HTML by allowing no tags.
  sanitized = DOMPurify.sanitize(sanitized, {
    ALLOWED_TAGS: [],       // Don't allow any HTML tags
    ALLOWED_ATTR: [],       // Don't allow any attributes
    KEEP_CONTENT: true,     // Keep the text content inside tags if any (e.g. "foo <script>bar</script>" becomes "foo bar")
  });
  
  return sanitized;
}

/**
 * Recursively traverses an object or array and sanitizes all string values.
 * @param payload The object/array to sanitize.
 * @returns A new object/array with sanitized strings.
 */
export function sanitizePayload<T>(payload: T): T {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === 'string') {
    return sanitizeString(payload) as unknown as T;
  }

  if (Array.isArray(payload)) {
    return payload.map(item => sanitizePayload(item)) as unknown as T;
  }

  if (typeof payload === 'object') {
    // Prevent traversing instances of Date, File, Blob, etc.
    if (payload instanceof Date || payload instanceof File || payload instanceof Blob) {
      return payload;
    }

    const sanitizedObj: any = {};
    for (const [key, value] of Object.entries(payload)) {
      sanitizedObj[key] = sanitizePayload(value);
    }
    return sanitizedObj as T;
  }

  // Return numbers, booleans, etc. as is.
  return payload;
}
