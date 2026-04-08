# Business Logic Session — Validation and Search Implementation

## Goal
Implement the two core business logic modules (`validate.ts` and `search.ts`) that were previously stubs, along with comprehensive unit tests for each.

## Decisions

- **Validation ordering** — combination rules checked first (at least one filter; must include lastname or specialty), then individual fields in deterministic order: lastname, specialty, gender, zipcode. Returns the first error found.
- **Empty string handling** — empty strings (`""`) are treated as "provided but invalid" (reach field validation), not as absent. Combination rules use `=== undefined` checks, not truthiness.
- **Specialty prefix matching** — uses SQL `LIKE ? || '%' COLLATE NOCASE` against both `classification` and `specialization` columns with OR logic. The `resolveSpecialty` function determines the output field based on which column(s) match the prefix.
- **Specialty output resolution** — when a specialty filter is provided, checks which column(s) match the prefix: if both match, returns the longer (classification wins ties); if only one matches, returns that one. When no specialty filter is provided, returns the longer of the two columns (classification wins ties).
- **Gender normalization** — `"male"` → `"M"`, `"female"` → `"F"` before querying. Validation is case-sensitive (only `male`, `female`, `M`, `F` accepted).
- **Search tests use in-memory SQLite** — mocks `db.ts` to return an in-memory database seeded with controlled test data (7 named records + 55 "Test" records for cap testing). No dependency on the real `doctors.db`.

## What Was Built

### `src/validate.ts` — Input Validation
- Phase A: combination rules (empty input, missing lastname/specialty)
- Phase B: individual field validation with regex checks
  - `lastname`: `^[A-Za-z-]+$`, min 3 chars
  - `specialty`: `^[A-Za-z -]+$`, min 3 chars
  - `gender`: exact match against `Set(["male", "female", "M", "F"])`
  - `zipcode`: `^[0-9]{5}$`

### `src/__tests__/validate.test.ts` — 53 Tests
- Combination rules (11 tests): all valid/invalid filter combinations
- Lastname validation (11 tests): length, characters, hyphens, unicode, whitespace
- Specialty validation (8 tests): length, characters, spaces, hyphens
- Gender validation (10 tests): valid values, case sensitivity, invalid values
- Zipcode validation (9 tests): format, length, leading zeros, whitespace
- Validation ordering (4 tests): deterministic order, combination-before-field priority

### `src/search.ts` — Doctor Search Query
- `normalizeGender()`: converts "male"/"female" to "M"/"F"
- `resolveSpecialty()`: determines output specialty field from classification/specialization
- `searchDoctors()`: builds dynamic WHERE clause with parameterized queries, runs COUNT + SELECT (ORDER BY npi ASC LIMIT 50), maps raw rows to `DoctorRecord[]`

### `src/__tests__/search.test.ts` — 44 Tests
- Prefix matching (7 tests): lastname and specialty prefix behavior
- Case insensitivity (4 tests): upper/lower/mixed case for lastname and specialty
- Gender normalization (4 tests): "male"/"female"/"M"/"F" mapping
- Exact matching (2 tests): zipcode and gender
- AND combination (5 tests): two/three/four filter intersections, empty intersection
- Result cap and total count (4 tests): 50-record cap, true total_count, zero results
- Output format (3 tests): field presence, no raw DB fields, gender normalization
- Specialty field mapping (6 tests): classification-only, specialization-only, both, no-filter defaults
- Result ordering (2 tests): NPI ascending, deterministic
- No results (3 tests): non-matching lastname, specialty, zipcode
- Edge cases (2 tests): hyphenated names, very long input
- Specialty tiebreaker (2 tests): equal-length (classification wins), different-length (longer wins)

## Issues Encountered

1. **Empty string vs. undefined in combination rules** — initial implementation used truthiness checks (`!lastname`), which treated `""` as absent and triggered combination errors instead of field validation errors. Fixed by using `=== undefined` checks. The acceptance tests (3.9, 3.17) expect field validation errors for empty strings.
2. **Test data assumptions** — "Smith" prefix matches both "Smith" and "Smithson", so AND combination tests needed adjustment for correct expected counts.
3. **Specialty prefix for "Interventional Cardiology"** — "Interventional Cardiology" does NOT match the prefix "Cardio" (it starts with "Interventional"), so only classification "Cardiology" matches. Test expectation adjusted accordingly. Note: acceptance test 11.3 appears to have an incorrect expectation for this case.

## Test Results

All 117 tests pass (53 validate + 44 search + 11 parse-values + 3 db + 6 import-integration). Full Docker build succeeds including compilation, tests, data import, and verification.
