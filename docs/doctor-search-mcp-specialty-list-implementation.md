# Doctor Search MCP Server — Specialty List Implementation Plan

## Context

We're adding a second MCP tool (`specialty-list`) that returns all distinct medical specialties from the `classification` column, sorted alphabetically. All design documents (spec, architecture, interface, business logic, acceptance tests) have already been updated. This plan covers the code changes to implement the feature.

## Files to Modify (in order)

### 1. `src/types.ts` — Add `SpecialtyListResult` type

- Update JSDoc header to mention specialty list results
- Add after `SearchResult` (line 29):
  ```typescript
  export interface SpecialtyListResult {
    specialties: string[];
  }
  ```

### 2. `src/search.ts` — Add `listSpecialties()` function

- Update JSDoc header (line 2): `"Doctor Search & Specialty List Queries"`
- Update import on line 11 to include `SpecialtyListResult`
- Add exported function after `searchDoctors` (after line 124):
  ```typescript
  export function listSpecialties(): SpecialtyListResult {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT DISTINCT classification FROM doctors WHERE classification IS NOT NULL AND classification != '' ORDER BY classification"
      )
      .all() as { classification: string }[];
    return { specialties: rows.map((row) => row.classification) };
  }
  ```

### 3. `src/server.ts` — Register tool, route calls, bump version

- Update JSDoc header to mention both tools
- Add `listSpecialties` to import from `search.js` (line 14)
- Bump version `"1.0.0"` → `"1.1.0"` (line 19)
- Add `specialty-list` tool definition to the `tools` array in `ListToolsRequestSchema` handler (after line 58):
  ```typescript
  {
    name: "specialty-list",
    description: "List all available medical specialties in the doctor directory. " +
      "Returns an alphabetically sorted list of distinct specialty names. " +
      "Use this to discover valid specialty values before searching with doctor-search.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      additionalProperties: false,
    },
  },
  ```
- Refactor `CallToolRequestSchema` handler (lines 62-103): replace the early `!== "doctor-search"` guard with multi-tool routing:
  - If `specialty-list`: try/catch around `listSpecialties()`, return JSON result or internal error
  - If `doctor-search`: existing arg extraction + validation + search logic (unchanged)
  - Else: unknown tool error (unchanged)

### 4. `package.json` — Bump version

- Change `"version": "1.0.0"` → `"1.1.0"` (line 3)

### 5. `src/__tests__/search.test.ts` — Add `listSpecialties` tests

- Update JSDoc header to mention both functions
- Update dynamic import (line 19) to also import `listSpecialties`
- Add `describe("listSpecialties", ...)` block after the tiebreaker tests (after line 429) with 6 tests:
  - Returns distinct values (no duplicates)
  - Returns alphabetically sorted results
  - Contains known specialties from test data
  - Excludes empty classification values (insert+cleanup pattern from tiebreaker tests)
  - Excludes null classification values (insert+cleanup)
  - Returns correct result shape (`{ specialties: string[] }`)

### 6. `src/__tests__/server.test.ts` — Add specialty-list mock and tests

- Add `listSpecialties` to the `search.js` mock (line 18): returns `{ specialties: ["Cardiology", "Internal Medicine", "Pediatrics"] }`
- Add import and `vi.mocked()` reference for `listSpecialties`
- Update `tools/list` test (line 67): `toHaveLength(1)` → `toHaveLength(2)`
- Add test: `specialty-list` tool appears in listing with correct schema
- Add `describe("tools/call specialty-list", ...)` block with 4 tests:
  - Returns specialty list on valid call
  - Calls `listSpecialties` (not validate or searchDoctors)
  - Does not call validate or searchDoctors
  - Returns internal error when `listSpecialties` throws

### 7. `src/__tests__/acceptance.test.ts` — Update protocol tests, add section 26

- Update JSDoc header: 132 → 141 tests
- Update test 1.2 (line 157-169): `toHaveLength(1)` → `toHaveLength(2)`, add assertions for `specialty-list` tool schema
- Add helpers after line 73:
  ```typescript
  async function callSpecialtyList(client: Client, args: Record<string, unknown> = {}) {
    return client.callTool({ name: "specialty-list", arguments: args });
  }
  async function callSpecialtyListSuccess(client: Client) {
    const result = await callSpecialtyList(client);
    expect(result.isError).toBeFalsy();
    const text = (result.content as ContentBlock[])[0].text;
    return JSON.parse(text) as { specialties: string[] };
  }
  ```
- Add section 26 before closing `});` (after line 1119) with 9 tests matching the acceptance test document:
  - 26.1 No-arg call returns success
  - 26.2 Response contains `specialties` as string array
  - 26.3 Sorted alphabetically
  - 26.4 Distinct (no duplicates)
  - 26.5 Known test data specialties present
  - 26.6 Empty/null classifications excluded
  - 26.7 Unexpected arguments handled
  - 26.8 Content block structure correct
  - 26.9 DB failure returns internal error (DB-swap pattern from test 15.1)

## No Changes Needed

- `src/index.ts` — entry point unchanged
- `src/db.ts` — database module unchanged
- `src/validate.ts` — no validation for specialty-list

## Verification

```bash
npx vitest run          # All tests pass (existing + new)
npx tsc --noEmit        # Type check passes
docker build -t doctor-search-mcp .  # Full build succeeds
```
