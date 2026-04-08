# Acceptance Tests Implementation Session

## Goal
Implement the 132 acceptance tests defined in `docs/doctor-search-mcp-acceptance-tests.md`, validating the full doctor-search MCP server stack through the MCP protocol layer.

## Decisions

- **Single test file** — all 132 tests live in `src/__tests__/acceptance.test.ts` with 25 `describe` blocks (one per spec section). A single file avoids `vi.mock` module isolation issues since the `db.js` mock is module-scoped.
- **Full-stack testing via InMemoryTransport** — tests exercise the complete path (Client -> Server -> validate -> search -> SQLite) using the same `Client` + `InMemoryTransport` pattern established in `integration.test.ts`. Only `db.js` is mocked, replaced with an in-memory SQLite database.
- **Shared test data seeded once** — `beforeAll` creates one in-memory DB with 7 core doctors, 55 "Test" doctors (cap testing), 50 "Fifty" doctors (exactly-50 boundary), and 5 special-purpose doctors (edge cases, tiebreakers). All tests share this read-only dataset.
- **DB swap for destructive tests** — Sections 15 (internal errors) and 24 (empty database) temporarily reassign `testDb` to a closed or empty DB, then restore the original. The `vi.mock` closure captures the variable binding, so reassignment changes what `getDb()` returns.
- **Helper functions** — `callTool()`, `callToolSuccess()`, `callToolError()` reduce boilerplate across 132 tests. Each helper asserts the expected success/error shape before returning parsed data.

## What Was Built

### `src/__tests__/acceptance.test.ts` — 132 Tests

| Section | Tests | Coverage |
|---------|-------|----------|
| 1. MCP Protocol Compliance | 5 | Server init, tool listing, success/error format, unknown tool |
| 2. Filter Combination Rules | 11 | All valid/invalid filter combinations |
| 3. Individual Field Validation | 32 | Boundary values, invalid chars, empty strings per field |
| 4. Multiple Invalid Fields | 3 | Simultaneous validation errors, priority |
| 5. Prefix Matching | 7 | Lastname and specialty prefix behavior |
| 6. Case Insensitivity | 8 | Upper/lower/mixed case for all fields |
| 7. Exact Matching | 3 | Zipcode and gender exact match |
| 8. AND Combination | 5 | Two, three, four filter intersections + empty intersection |
| 9. Result Cap & Total Count | 5 | Cap at 50, total_count accuracy, boundary cases |
| 10. Output Format | 6 | Field presence, types, normalization |
| 11. Specialty Field Mapping | 4 | Classification/specialization selection logic |
| 12. No Results | 4 | Valid queries returning zero matches |
| 13. Edge Cases — Input | 11 | Extra props, non-string types, null, SQL injection, unicode |
| 14. Edge Cases — Data | 5 | Empty fields, hyphens in data |
| 15. Internal Errors | 2 | Database failure, error format (no details leaked) |
| 16. Response Structure | 4 | JSON validity, content block format |
| 17. Validation Priority | 2 | Validation-before-search guarantee |
| 18. Validation Ordering | 1 | Deterministic field validation order |
| 19. Result Ordering | 2 | Deterministic NPI ascending sort |
| 20. Specialty Field Default | 3 | No specialty filter — longer of classification/specialization |
| 21. Gender Case Sensitivity | 3 | Uppercase/title-case variants rejected |
| 22. Prefix Matching Boundaries | 2 | Cross-doctor OR logic, hyphen in prefix |
| 23. Repeated Calls | 1 | Consistency across sequential calls |
| 24. Empty Database | 1 | Valid query against zero rows |
| 25. Specialty Tiebreaker | 2 | Equal-length (classification wins) and different-length (longer wins) |

### `docs/doctor-search-mcp-acceptance-tests-implementation.md`
Implementation plan document saved before coding began.

### Extra Test Data Seeded

| NPI | last_name | Purpose |
|-----|-----------|---------|
| 3000000001 | Emptyclass | Empty classification (sec 14.2, 20.2) |
| 3000000002 | Bothempty | Both classification and specialization empty (sec 14.3) |
| 3000000003 | Hyphenspec | Hyphenated classification "Non-Surgical" (sec 14.5) |
| 9000000001 | Tiebreak | Equal-length classification/specialization "Sleep Medicine"/"Sleep Disorder" (sec 25.2) |
| 9000000002 | Tiebreak | Different-length "Sports Medicine"/"Sports Orthopedics" (sec 25.1) |
| 55 x Test | Test | last_name="Test" for result cap testing (sec 9.1-9.2) |
| 50 x Fifty | Fifty | last_name="Fifty" for exactly-50 boundary (sec 9.4) |

## Corrections During Verification

Three test expectations from the spec were adjusted to match correct implementation behavior:

1. **Test 8.1 (lastname AND gender intersection)** — The spec assumed `{ lastname: "Smith", gender: "male" }` returns only NPI 1000000001, but prefix matching on "Smith" also matches "Smithson" (NPI 1000000003, also male). Fixed to verify 1000000001 is included and 1000000002 (female) is excluded.

2. **Test 8.5 (empty intersection)** — The spec used `{ lastname: "Smith", gender: "male", zipcode: "60601" }` expecting zero results, but Smithson (male, zipcode 60601) matches. Changed to `gender: "female"` to produce a true empty intersection.

3. **Test 11.3 (specialty matches both columns)** — The spec claimed "Cardio" prefix matches both classification "Cardiology" and specialization "Interventional Cardiology" for NPI 1000000004, but `startsWith("cardio")` is false for "interventional cardiology". Replaced with NPI 9000000002 where both "Sports Medicine" and "Sports Orthopedics" genuinely match prefix "Sports".

## Final Test Run

```
Test Files  8 passed (8)
     Tests  266 passed (266)  — 132 acceptance + 134 existing
  Duration  859ms
```

Docker build completed successfully including compilation, all tests, data import, and verification.
