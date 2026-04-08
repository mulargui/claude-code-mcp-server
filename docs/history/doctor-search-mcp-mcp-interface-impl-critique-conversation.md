# Doctor Search MCP Server — MCP Interface Implementation Critique Conversation

## Session Summary

Reviewed the full MCP server implementation (index.ts, server.ts, search.ts, validate.ts) and the corresponding test suites against the spec, architecture, and interface docs. Produced a critique covering bugs, correctness concerns, test gaps, and minor/style issues. Then fixed all nine items.

## Critique

Saved to `docs/doctor-search-mcp-mcp-interface-impl-critique.md`.

### Bugs (1–3)

1. **Signal handlers don't exit the process** (`index.ts`) — `SIGINT`/`SIGTERM` handlers called `shutdown()` without `await` and never called `process.exit()`, so the process would hang after cleanup.
2. **No error handling on startup** (`index.ts`) — `main()` had no `.catch()`, so a failed `openDb()` would produce an unhandled promise rejection with no error output.
3. **Unsafe type cast of tool arguments** (`server.ts`) — `request.params.arguments` was cast directly to `DoctorSearchInput` without checking that values were actually strings. A client sending non-string values could bypass validation.

### Correctness Concerns (4–5)

4. **`LIMIT` interpolated rather than parameterized** (`search.ts`) — Used template literal `LIMIT ${RESULT_LIMIT}` instead of a bound parameter. No injection risk (constant value), but broke the parameterized query convention.
5. **No guard against empty filters** (`search.ts`) — `searchDoctors` would produce a full table scan if called without prior validation.

### Test Gaps (6–7)

6. **No test for unknown tool name** (`server.test.ts`) — The unknown-tool error branch in server.ts had no test coverage.
7. **No integration test for index.ts wiring** — The full DB → server → transport round-trip was untested.

### Minor / Style (8–9)

8. **No observability** — No startup message or error logging anywhere. Stdio transport prevents `console.log`, but `console.error` was available and unused.
9. **`resolveSpecialty` tiebreaker undocumented** — The business rule for choosing between classification and specialization had no comment.

## Fixes Applied

### Bugs

- **index.ts**: `shutdown()` now calls `process.exit(0)` after cleanup. Signal handlers use `void` to explicitly handle the async call. `main()` has a `.catch()` that logs to stderr and exits with code 1.
- **server.ts**: Arguments are now iterated and type-checked per field. Non-string values for known fields return an immediate error (`"Invalid <field>: must be a string."`).

### Correctness

- **search.ts**: `LIMIT ${RESULT_LIMIT}` replaced with `LIMIT ?` and the value appended to the params array. Added a guard that throws if `conditions` is empty.

### Tests

- **server.test.ts**: Added test for unknown tool name — verifies `isError: true` and correct error message.
- **integration.test.ts**: New test file (5 tests) exercising the full round-trip with real validate/search modules and an in-memory SQLite database. Covers: tool listing, valid search, validation error, specialty prefix matching both columns, AND combination of multiple filters.

### Minor / Style

- **index.ts**: Added `console.error("doctor-search-mcp server started")` after transport connect.
- **search.ts**: Added JSDoc to `resolveSpecialty` explaining the tiebreaker business rule.

## Test Results

All 134 tests pass across 7 test files (up from 128 tests / 6 files before this session).
