/**
 * data/__tests__/parse-values.test.ts — VALUES Parser Unit Tests
 *
 * Tests the MySQL VALUES clause parser against edge cases:
 * escaped quotes, NULLs, embedded commas, and multi-tuple inputs.
 */
import { describe, it, expect } from "vitest";
import { parseValues, MIN_FIELDS } from "../parse-values.js";

// Helper: build a VALUES string with 19 fields per tuple (the minimum required).
// Fields are filled with placeholder values; overrides replace specific indices.
function makeTuple(overrides: Record<number, string> = {}): string {
  const fields = Array.from({ length: 19 }, (_, i) =>
    `'field${i}'`
  );
  for (const [idx, val] of Object.entries(overrides)) {
    fields[Number(idx)] = val;
  }
  return `(${fields.join(",")})`;
}

describe("parseValues", () => {
  it("parses a single tuple with simple quoted fields", () => {
    const input = makeTuple({ 0: "'NPI1'", 1: "'SMITH'" });
    const result = parseValues(input);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("NPI1");
    expect(result[0][1]).toBe("SMITH");
  });

  it("handles escaped single quotes", () => {
    const input = makeTuple({ 1: "'O\\'BRIEN'" });
    const result = parseValues(input);
    expect(result[0][1]).toBe("O'BRIEN");
  });

  it("handles NULL values as empty strings", () => {
    const input = makeTuple({ 5: "NULL" });
    const result = parseValues(input);
    expect(result[0][5]).toBe("");
  });

  it("handles commas inside quoted strings", () => {
    const input = makeTuple({ 8: "'123 Main St, Suite 4'" });
    const result = parseValues(input);
    expect(result[0][8]).toBe("123 Main St, Suite 4");
  });

  it("strips escaped \\r and \\n sequences", () => {
    const input = makeTuple({ 8: "'Line1\\r\\nLine2'" });
    const result = parseValues(input);
    expect(result[0][8]).toBe("Line1Line2");
  });

  it("handles escaped backslashes", () => {
    const input = makeTuple({ 8: "'back\\\\slash'" });
    const result = parseValues(input);
    expect(result[0][8]).toBe("back\\slash");
  });

  it("parses multiple tuples in one VALUES clause", () => {
    const t1 = makeTuple({ 0: "'NPI1'" });
    const t2 = makeTuple({ 0: "'NPI2'" });
    const t3 = makeTuple({ 0: "'NPI3'" });
    const input = `${t1},${t2},${t3}`;
    const result = parseValues(input);
    expect(result).toHaveLength(3);
    expect(result[0][0]).toBe("NPI1");
    expect(result[1][0]).toBe("NPI2");
    expect(result[2][0]).toBe("NPI3");
  });

  it("skips tuples with fewer than MIN_FIELDS fields", () => {
    const shortTuple = "('a','b','c')";
    const fullTuple = makeTuple({ 0: "'VALID'" });
    const input = `${shortTuple},${fullTuple}`;
    const result = parseValues(input);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("VALID");
  });

  it("handles trailing semicolon", () => {
    const input = makeTuple({ 0: "'NPI1'" }) + ";";
    const result = parseValues(input);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("NPI1");
  });

  it("returns empty array for empty input", () => {
    expect(parseValues("")).toHaveLength(0);
  });

  it("returns empty array for input with no tuples", () => {
    expect(parseValues("no parentheses here")).toHaveLength(0);
  });
});
