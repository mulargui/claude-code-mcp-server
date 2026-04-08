# Doctor Search MCP Server — Business Logic Critique Conversation

## Session Summary

Reviewed and improved the business logic implementation (`src/validate.ts` and `src/search.ts`).

## Phase 1: Critique

Read all source files, docs (spec, architecture, interface), and test suites. Produced a critique identifying 7 issues ranked by severity, documented in `docs/doctor-search-mcp-business-logic-critique.md`.

## Phase 2: Fixes (Issues 1–4)

### Issue 1 — Null safety in `RawRow` (`src/search.ts`)

The `RawRow` interface typed all columns as `string`, but the SQLite schema allows NULLs on most columns. `better-sqlite3` returns `null` for SQL NULLs, creating a runtime type mismatch.

**Fix:** Changed nullable fields in `RawRow` to `string | null`. Added `?? ""` fallbacks in the result mapper for `classification`, `specialization`, `gender`, `address`, `city`, `zipcode`, and `phone`.

### Issue 2 — Degenerate input validation (`src/validate.ts`)

The original regexes accepted all-hyphen lastnames (`"---"`) and all-space specialties (`"   "`).

**Fix:**
- `LASTNAME_RE`: `/^[A-Za-z-]+$/` changed to `/^[A-Za-z][A-Za-z-]*$/` (must start with a letter)
- `SPECIALTY_RE`: `/^[A-Za-z -]+$/` changed to `/^(?=.*[A-Za-z])[A-Za-z -]+$/` (must contain at least one letter)

Added 4 new test cases in `src/__tests__/validate.test.ts`: all-hyphen lastname, leading-hyphen lastname, all-space specialty, all-hyphen specialty.

### Issue 3 — Misleading `COLLATE NOCASE` in LIKE clauses (`src/search.ts`)

`COLLATE NOCASE` was appended to LIKE expressions with confusing operator precedence. SQLite's LIKE is already case-insensitive for ASCII characters, making it redundant.

**Fix:** Removed `COLLATE NOCASE` from both the `last_name` and `classification`/`specialization` LIKE clauses.

### Issue 4 — Missing `COLLATE NOCASE` on gender/zipcode equality

The architecture doc specified case-insensitive equality via `COLLATE NOCASE`, but the code used plain `=`. This is functionally correct since gender is normalized to `M`/`F` and zipcodes are digits-only.

**Fix:** No code change. Consistent with issue #3's approach of not adding unnecessary collation directives.

## Verification

Built the Docker image (`docker build -t doctor-search-mcp .`). All 121 tests passed across 5 test files (57 validate, 44 search, 3 db, 11 parser, 6 import integration).

## Files Modified

- `src/validate.ts` — tightened regexes
- `src/search.ts` — null-safe `RawRow`, removed `COLLATE NOCASE`, added `?? ""` fallbacks
- `src/__tests__/validate.test.ts` — added 4 degenerate-input test cases
- `docs/doctor-search-mcp-business-logic-critique.md` — new critique document
