# Specialty List Feature — Design & Implementation Session

## Goal
Add a new `specialty-list` tool to the MCP server that returns all distinct medical specialties available in the database, so users can discover valid specialty values before searching with `doctor-search`.

## Design Decisions

- **Tool name:** `specialty-list` (noun-first, consistent with `doctor-search`)
- **Input:** None — the tool takes no parameters (`additionalProperties: false`)
- **Output:** `{ specialties: string[] }` — alphabetically sorted, distinct values
- **Source column:** `classification` only (not `specialization`)
- **No filtering:** Always returns the full list; no prefix parameter
- **Version bump:** Server and package version `1.0.0` → `1.1.0`

## Documents Updated

All six design documents were updated to include the new feature:

| Document | Key Changes |
|----------|-------------|
| `docs/doctor-search-mcp-spec.md` | Overview updated to "two tools", `## Tool` → `## Tools`, new `### specialty-list` section with input/output/errors/example |
| `docs/doctor-search-mcp-interface.md` | Version to 1.1.0, new `## Tool: specialty-list` section with description, empty input schema, output format, error cases. Protocol details updated for two tools |
| `docs/doctor-search-mcp-architecture.md` | Context updated, `server.ts` registers both tools, `search.ts` split into `searchDoctors` + `listSpecialties`, `types.ts` gains `SpecialtyListResult`, data flow diagram updated, smoke queries updated |
| `docs/doctor-search-mcp-infrastructure.md` | Context and version updated (cosmetic only — no infrastructure changes needed) |
| `docs/doctor-search-mcp-business-logic.md` | Context/scope updated, `listSpecialties()` function spec added to Step 3, test coverage for `listSpecialties` added to Step 4 |
| `docs/doctor-search-mcp-acceptance-tests.md` | Overview updated, test 1.1 version to 1.1.0, test 1.2 updated for two tools, new section 26 with 9 tests, summary table updated to 141 total |
| `docs/doctor-search-mcp-data-import.md` | No changes needed — existing import already handles the `classification` column |
| `docs/doctor-search-mcp-testing.md` | Reviewed — no changes needed; coverage documented in business logic and acceptance test docs |

## Implementation Plan

Created `docs/doctor-search-mcp-specialty-list-implementation.md` with step-by-step code changes for all 7 files.

## What Was Built

### Source Changes

| File | Changes |
|------|---------|
| `src/types.ts` | Added `SpecialtyListResult` interface |
| `src/search.ts` | Added `listSpecialties()` — `SELECT DISTINCT classification` query, returns sorted array |
| `src/server.ts` | Version bumped to 1.1.0, `specialty-list` tool registered in `tools/list`, call handler refactored to multi-tool routing (`specialty-list` → `listSpecialties()`, `doctor-search` → existing logic, else → unknown tool error) |
| `package.json` | Version bumped to 1.1.0 |

### Test Changes

| File | Changes |
|------|---------|
| `src/__tests__/search.test.ts` | 6 new `listSpecialties` unit tests (distinct, sorted, known values, excludes empty, excludes null, correct shape) |
| `src/__tests__/server.test.ts` | Added `listSpecialties` mock, updated tool listing test (1 → 2 tools), added `specialty-list` schema test, 4 new call tests (success, calls correct function, doesn't call validate/searchDoctors, internal error) |
| `src/__tests__/acceptance.test.ts` | Updated test 1.2 for two tools, added `callSpecialtyList`/`callSpecialtyListSuccess` helpers, added section 26 with 9 tests (26.1–26.9), total 141 tests |
| `src/__tests__/integration.test.ts` | Fixed tool listing assertion (1 → 2 tools) — not in original plan but caught by test run |

### Final Results

- **8 test files, 286 tests, all passing**
- TypeScript compilation clean
- Docker build succeeds (compile → test → import → verify)
