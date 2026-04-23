# Plan: Implement 151 Acceptance Tests

## Context

The Doctor Search MCP Server has its core modules implemented (`validate.ts`, `search.ts`, `server.ts`, `db.ts`, `index.ts`) and existing unit/integration tests. The acceptance test spec (`docs/doctor-search-mcp-acceptance-tests.md`) defines 151 tests across 27 categories that validate the server's behavior through the MCP protocol layer. This plan creates those acceptance tests.

## Approach

**Two files**:
- `src/__tests__/acceptance.test.ts` (~2000 lines, 141 tests in 26 `describe` blocks) — tool behavior tests via InMemoryTransport
- `src/__tests__/http.test.ts` — HTTP transport tests (10 tests) via direct HTTP requests

Tool behavior tests go through the MCP Client/Server round-trip via `InMemoryTransport` — the exact pattern already used in `integration.test.ts`. The only mock is `db.ts`, replaced with an in-memory SQLite database seeded with test data. This tests the full stack (server.ts -> validate.ts -> search.ts -> SQLite) as an MCP client would observe it.

HTTP transport tests start a real HTTP server on a random high port and use `fetch()` to exercise the Streamable HTTP transport endpoint at `/mcp`. These verify routing, session management, and that tool behavior is identical over HTTP.

**Why split**: InMemoryTransport tests share a single `vi.mock("../db.js")` scope. HTTP tests use a separate mock scope and start an actual HTTP server, making them a natural separate file.

## Test Infrastructure

### Setup (beforeAll)
1. Create in-memory SQLite DB with the `doctors` table + indexes
2. Seed the 7 core test doctors from the acceptance spec
3. Seed 55 "Test" doctors (last_name="Test", classification="Pediatrics") for cap testing
4. Seed 50 "Fifty" doctors for exactly-50-results test (section 9.4)
5. Seed special-purpose doctors for edge case sections (14.2, 14.3, 14.5, 25.1, 25.2)
6. Create MCP Server via `createServer()`, connect Client via `InMemoryTransport.createLinkedPair()`

### Helper Functions
```typescript
callTool(args)        → raw CallToolResult
callToolSuccess(args) → parsed { total_count, doctors[] }
callToolError(args)   → error text string
```

### Special DB Handling
- **Section 15 (Internal errors)**: Temporarily swap `testDb` to a closed DB so queries throw, then restore
- **Section 24 (Empty database)**: Temporarily swap `testDb` to an empty DB (table exists, no rows), then restore

## Test Sections → Implementation

| Section | Tests | Strategy |
|---------|-------|----------|
| 1. MCP Protocol | 5 | `client.listTools()`, `client.callTool()`, server info checks |
| 2. Combination Rules | 11 | `callToolError`/`callToolSuccess` with various filter combos |
| 3. Field Validation | 32 | `callToolError`/`callToolSuccess` per field, exact error messages |
| 4. Multiple Invalid | 3 | Verify first error reported matches validation order |
| 5. Prefix Matching | 7 | `callToolSuccess`, check returned NPIs |
| 6. Case Insensitivity | 8 | Lower/upper/mixed case inputs, verify matches |
| 7. Exact Matching | 3 | Zipcode exact, gender exact |
| 8. AND Combination | 5 | Multi-filter, verify intersection of results |
| 9. Result Cap | 5 | 55 "Test" doctors → 50 returned, total_count=55; "Fifty" → exactly 50 |
| 10. Output Format | 6 | Field presence, types, normalization checks |
| 11. Specialty Mapping | 4 | Classification/specialization selection with specialty filter |
| 12. No Results | 4 | Valid queries returning 0 |
| 13. Edge Cases Input | 11 | Extra props, non-string types, null, long strings, SQL injection, unicode |
| 14. Edge Cases Data | 5 | Empty classification/specialization, hyphens |
| 15. Internal Errors | 2 | Swap testDb to closed DB, verify generic error message |
| 16. Response Structure | 4 | JSON validity, content block format, isError flag |
| 17. Validation Priority | 2 | Validation errors returned before search executes |
| 18. Validation Ordering | 1 | Lastname error first when all fields invalid |
| 19. Result Ordering | 2 | NPI ascending, deterministic across calls |
| 20. Specialty Default | 3 | No specialty filter → longer of classification/specialization |
| 21. Gender Case | 3 | "MALE", "Male", "FEMALE" rejected |
| 22. Prefix Boundaries | 2 | Cross-doctor OR logic, hyphen in prefix |
| 23. Repeated Calls | 1 | 3 identical calls → identical results |
| 24. Empty Database | 1 | Swap testDb to empty DB, verify 0 results (not error) |
| 25. Specialty Tiebreaker | 2 | Equal-length → classification wins; different-length → longer wins |
| 26. Specialty List | 9 | No-arg success, output format, sorting, dedup, known values, nulls, bad args, content block, DB failure |
| 27. HTTP Transport | 10 | Routing (404, 405), request validation (400), session lifecycle, tool calls, multi-session |

## Extra Test Data (beyond 7 core + 55 Test doctors)

| NPI | last_name | classification | specialization | Purpose |
|-----|-----------|----------------|----------------|---------|
| 3000000001 | Emptyclass | (empty) | Sports Medicine | Sec 14.2, 20.2 |
| 3000000002 | Bothempty | (empty) | (empty) | Sec 14.3 |
| 3000000003 | Hyphenspec | Non-Surgical | (empty) | Sec 14.5 |
| 9000000001 | Tiebreak | Sleep Medicine | Sleep Disorder | Sec 25.2 (equal length) |
| 9000000002 | Tiebreak | Sports Medicine | Sports Orthopedics | Sec 25.1 (different length) |
| 50 x "Fifty" | Fifty | Pediatrics | (empty) | Sec 9.4 (exactly 50) |

## Implementation Steps

1. **Create file scaffold**: JSDoc header, imports, `vi.mock`, test data constants, `beforeAll`/`afterAll`, helpers
2. **Sections 1-4**: Protocol + validation tests (51 tests)
3. **Sections 5-9**: Search logic tests (28 tests)
4. **Sections 10-14**: Output format + edge cases (26 tests)
5. **Sections 15-18**: Error handling + validation priority (9 tests)
6. **Sections 19-25**: Ordering, defaults, boundaries, tiebreaker (14 tests)
7. **Section 27**: HTTP transport tests in `src/__tests__/http.test.ts` (10 tests)
8. **Run full suite via Docker**: `docker build -t doctor-search-mcp .` to confirm all tests pass

## Key Files

- **Create**: `src/__tests__/acceptance.test.ts` (sections 1-26)
- **Create**: `src/__tests__/http.test.ts` (section 27)
- **Reference**: `src/__tests__/integration.test.ts` (MCP client/server pattern)
- **Reference**: `src/__tests__/search.test.ts` (DB seeding pattern)
- **Spec**: `docs/doctor-search-mcp-acceptance-tests.md` (151 test definitions)

## Verification

```bash
docker build -t doctor-search-mcp .   # runs full suite (tsc + vitest + data import) inside Docker
```
