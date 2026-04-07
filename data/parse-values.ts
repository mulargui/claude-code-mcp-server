/**
 * data/parse-values.ts — MySQL VALUES Clause Parser
 *
 * Shared parser used by the import pipeline and its tests.
 *
 * Exports:
 *   parseValues(valuesStr) — parse a MySQL VALUES clause into string[][] tuples
 *   COL                    — column index mapping for npidata2 rows
 *   MIN_FIELDS             — minimum field count to accept a tuple
 */

// Column indices in the npidata2 INSERT VALUES tuples (0-based)
export const COL = {
  NPI: 0,
  LAST_NAME: 1,
  FIRST_NAME: 2,
  FULL_STREET: 8,
  CITY: 9,
  SHORT_POSTAL_CODE: 13,
  PHONE: 14,
  GENDER: 15,
  CLASSIFICATION: 17,
  SPECIALIZATION: 18,
} as const;

// Minimum number of fields expected per tuple (npidata2 has 19 columns: indices 0-18)
export const MIN_FIELDS = 19;

/**
 * Parse a MySQL VALUES clause into an array of string arrays (tuples).
 * Handles escaped single quotes (\'), commas inside quoted strings,
 * and literal \r sequences.
 */
export function parseValues(valuesStr: string): string[][] {
  const tuples: string[][] = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    // Find the start of a tuple
    while (i < len && valuesStr[i] !== "(") i++;
    if (i >= len) break;
    i++; // skip '('

    const fields: string[] = [];
    while (i < len && valuesStr[i] !== ")") {
      if (valuesStr[i] === "'") {
        // Quoted field — collect until unescaped closing quote
        i++; // skip opening quote
        let value = "";
        while (i < len) {
          if (valuesStr[i] === "\\" && i + 1 < len) {
            if (valuesStr[i + 1] === "'") {
              value += "'";
              i += 2;
              continue;
            } else if (valuesStr[i + 1] === "r") {
              // literal \r in dump — skip it
              i += 2;
              continue;
            } else if (valuesStr[i + 1] === "n") {
              i += 2;
              continue;
            } else if (valuesStr[i + 1] === "\\") {
              value += "\\";
              i += 2;
              continue;
            }
          }
          if (valuesStr[i] === "'") {
            i++; // skip closing quote
            break;
          }
          value += valuesStr[i];
          i++;
        }
        fields.push(value);
      } else if (
        valuesStr[i] === "N" &&
        valuesStr.substring(i, i + 4) === "NULL"
      ) {
        fields.push("");
        i += 4;
      } else {
        // Unquoted field (shouldn't happen for string columns, but handle it)
        let value = "";
        while (i < len && valuesStr[i] !== "," && valuesStr[i] !== ")") {
          value += valuesStr[i];
          i++;
        }
        fields.push(value);
      }

      // Skip comma between fields
      if (i < len && valuesStr[i] === ",") i++;
    }

    if (i < len) i++; // skip ')'

    if (fields.length >= MIN_FIELDS) {
      tuples.push(fields);
    }

    // Skip comma between tuples or semicolon at end
    if (i < len && (valuesStr[i] === "," || valuesStr[i] === ";")) i++;
  }

  return tuples;
}
