# Doctor Search MCP Server — Business Logic Implementation Plan

## Context

The doctor-search MCP server has stub implementations for `validate.ts` and `search.ts`. All types, the DB module, and the data import pipeline are already complete. This step implements the two core business logic modules so that validated, parameterized queries can run against the SQLite database.

## Scope

Two source files + two test files. No changes to `server.ts`, `index.ts`, `db.ts`, or `types.ts`.

---

## Step 1: Implement `src/validate.ts`

**File:** `src/validate.ts`

Validation runs in two phases, in order:

**Phase A — Combination rules** (checked first):
1. If no fields provided at all → `"At least one filter is required."`
2. If fields provided but neither `lastname` nor `specialty` → `"At least 'lastname' or 'specialty' must be included as a filter."`

**Phase B — Individual field validation** (order: lastname, specialty, gender, zipcode):
- **lastname:** `>= 3 chars`, regex `^[A-Za-z-]+$` → error: `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`
- **specialty:** `>= 3 chars`, regex `^[A-Za-z -]+$` → error: `"Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."`
- **gender:** must be exactly one of `"male"`, `"female"`, `"M"`, `"F"` (case-sensitive) → error: `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."`
- **zipcode:** regex `^[0-9]{5}$` → error: `"Invalid zipcode: must be exactly 5 digits."`

Only validate fields that are present (not `undefined`). Return the first error found, or `null` on success.

## Step 2: Write tests for `src/validate.ts`

**File:** `src/__tests__/validate.test.ts`

Cover all acceptance test categories 2-4, 18, 21 (combination rules, individual field rules, multiple invalid fields, validation ordering, gender case sensitivity). Tests call `validate()` directly — no DB needed.

## Step 3: Implement `src/search.ts`

**File:** `src/search.ts`

`searchDoctors(input: DoctorSearchInput): SearchResult`

1. **Normalize gender:** `"male"` → `"M"`, `"female"` → `"F"` (pass through `"M"`/`"F"` as-is)
2. **Build WHERE clause dynamically** — parameterized, AND-combined:
   - `lastname`: `last_name LIKE ? || '%' COLLATE NOCASE`
   - `specialty`: `(classification LIKE ? || '%' COLLATE NOCASE OR specialization LIKE ? || '%' COLLATE NOCASE)` — bind the same value twice
   - `gender`: `gender = ?`
   - `zipcode`: `zipcode = ?`
3. **Run COUNT query** — `SELECT COUNT(*) as count FROM doctors WHERE ...` with same params → `total_count`
4. **Run SELECT query** — `SELECT npi, last_name, first_name, classification, specialization, gender, address, city, zipcode, phone FROM doctors WHERE ... ORDER BY npi ASC LIMIT 50` with same params
5. **Map rows to `DoctorRecord[]`** — for each row, compute the `specialty` output field:
   - If a `specialty` filter was provided:
     - Check which column(s) match the prefix (case-insensitive `startsWith`)
     - If both match → return the longer string (classification wins on equal length)
     - If only one matches → return that one
   - If no `specialty` filter was provided:
     - Return the longer of `classification`/`specialization` (classification wins on equal length)
   - Map `last_name` → `lastname`, `first_name` → `firstname`
6. Return `{ total_count, doctors }`

Uses `getDb()` from `db.ts` for the database connection. Uses `better-sqlite3`'s synchronous API (`.prepare().all()`, `.prepare().get()`).

## Step 4: Write tests for `src/search.ts`

**File:** `src/__tests__/search.test.ts`

Tests need a real SQLite database with known test data (the same dataset from the acceptance tests doc). Each test suite:
- Creates an in-memory SQLite database with the `doctors` table schema
- Seeds the controlled test dataset (7 named records + 55 "Test" records for cap testing)
- Calls `searchDoctors()` and asserts results

Cover acceptance test categories 5-12, 19-20, 22, 24-25 (prefix matching, case insensitivity, exact matching, AND combination, result cap, output format, specialty mapping, no results, ordering, specialty defaults, tiebreaker).

**DB mocking approach:** Since `search.ts` calls `getDb()`, tests will mock the `db.ts` module to return the in-memory test database instead of the file-based one.

---

## Verification

```bash
# Run unit tests
npx vitest run src/__tests__/validate.test.ts
npx vitest run src/__tests__/search.test.ts

# Type-check
npx tsc --noEmit
```
