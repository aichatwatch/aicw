import { parse as csvParse } from 'csv-parse/sync';

/**
 * Configuration options for CSV parsing
 */
export interface CsvParseOptions {
  /** Skip empty lines */
  skipEmptyLines?: boolean;
  /** Trim whitespace from fields */
  trim?: boolean;
  /** Allow variable number of columns per row */
  relaxColumnCount?: boolean;
  /** Handle malformed quotes gracefully */
  relaxQuotes?: boolean;
  /** Custom delimiter (default: comma) */
  delimiter?: string;
}

/**
 * Result of parsing a CSV row with mapped attributes
 */
export interface CsvRowResult<T = Record<string, any>> {
  /** The parsed row data mapped to the specified attributes */
  data: T;
  /** The original raw row array */
  raw: string[];
  /** The row index (0-based) */
  index: number;
}

/**
 * Result of parsing an entire CSV with mapped attributes
 */
export interface CsvParseResult<T = Record<string, any>> {
  /** Successfully parsed rows */
  rows: CsvRowResult<T>[];
  /** Rows that failed to parse or were skipped */
  skipped: Array<{
    raw: string[];
    index: number;
    reason: string;
  }>;
  /** Total number of rows processed */
  totalRows: number;
}

/**
 * Default CSV parsing options
 */
const DEFAULT_OPTIONS: CsvParseOptions = {
  skipEmptyLines: true,
  trim: true,
  relaxColumnCount: true,
  relaxQuotes: true,
  delimiter: ','
};

/**
 * Parse CSV content with configurable column mapping
 * 
 * @param content - The CSV content as a string
 * @param attributes - Array of attribute names to map columns to (in order)
 * @param options - Parsing options
 * @returns Parsed CSV data with mapped attributes
 * 
 * @example
 * ```typescript
 * const csvContent = "1,term1,term2,term3\n2,another,term";
 * const result = parseCsvWithAttributes(csvContent, ['id', 'term1', 'term2', 'term3']);
 * // result.rows[0].data = { id: '1', term1: 'term1', term2: 'term2', term3: 'term3' }
 * ```
 */
export function parseCsvWithAttributes<T = Record<string, any>>(
  content: string,
  attributes: string[],
  options: CsvParseOptions = {}
): CsvParseResult<T> {
  const parseOptions = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Parse the CSV content
    const rawRows = csvParse(content, {
      skip_empty_lines: parseOptions.skipEmptyLines,
      trim: parseOptions.trim,
      relax_column_count: parseOptions.relaxColumnCount,
      relax_quotes: parseOptions.relaxQuotes,
      delimiter: parseOptions.delimiter
    });

    const rows: CsvRowResult<T>[] = [];
    const skipped: Array<{ raw: string[]; index: number; reason: string }> = [];

    // Process each row
    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      
      if (!Array.isArray(raw)) {
        skipped.push({
          raw: [],
          index: i,
          reason: 'Row is not an array'
        });
        continue;
      }

      if (raw.length === 0) {
        skipped.push({
          raw,
          index: i,
          reason: 'Empty row'
        });
        continue;
      }

      // Map columns to attributes
      const data: any = {};
      for (let j = 0; j < raw.length; j++) {
        const attributeName = attributes[j] || `column${j}`;
        const value = raw[j];
        if (j < attributes.length) {
          data[attributeName] = value;
        } else {
          // otherwise include new column value into the last attribute by adding a comma
          data[attributes[attributes.length - 1]] = data[attributes[attributes.length - 1]] + ',' + value;
        }
      }

      rows.push({
        data: data as T,
        raw,
        index: i
      });
    }

    return {
      rows,
      skipped,
      totalRows: rawRows.length
    };

  } catch (error) {
    throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : String(error)}`);
  }
}
