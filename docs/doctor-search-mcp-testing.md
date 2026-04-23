# Plan: Add Unit and Integration Tests with Vitest

## Context
The doctor-search MCP server has implemented data import (`data/import-data.ts`, `data/verify-data.ts`) and core modules (`src/db.ts`, `src/types.ts`). The search (`src/search.ts`) and validate (`src/validate.ts`) modules are stubs. We need a test framework to validate existing functionality and support future development.

## Step 1: Install Vitest and configure
- `npm install -D vitest`
- Add `"test"` script to `package.json`
- Add a `vitest.config.ts` with minimal config (no special transforms needed for ESM + TS)

## Step 2: Unit tests for `parseValues` (data/import-data.ts)
The `parseValues` function is private. To test it without restructuring, we'll extract it into a shared module `data/parse-values.ts` and import it from both `import-data.ts` and the test.

Test cases:
- Single tuple with simple quoted fields
- Escaped single quotes (`\'`)
- NULL handling
- Commas inside quoted strings
- Escaped `\r` and `\n` sequences
- Multiple tuples in one VALUES clause
- Tuples with fewer than MIN_FIELDS are skipped

Test file: `data/__tests__/parse-values.test.ts`

## Step 3: Unit tests for `src/db.ts`
Test against a temporary in-memory or temp-file SQLite database. Since `db.ts` hardcodes the path, tests will create their own `better-sqlite3` instances directly rather than testing through the singleton (which is tightly coupled to the file path).

Test cases:
- `getDb()` throws before `openDb()` is called
- `openDb()` + `getDb()` returns a database instance
- `closeDb()` sets db to null
- Double `openDb()` is idempotent
- Double `closeDb()` is safe

Test file: `src/__tests__/db.test.ts`

## Step 4: Integration test for data import pipeline (self-contained)
Create a **self-contained** integration test that needs no external data. The test will:
- Build a small synthetic SQL dump string (3-4 fake records in MySQL INSERT format)
- Write it to a temp file
- Run the import logic (extracted into a reusable function) against it into a temp SQLite DB
- Verify the resulting database

This means **all tests run before `import-data`** — no dependency on `doctors.db` or `healthylinkxdump.sql`.

To make this work, we'll extract the core import logic from `import-data.ts` into a reusable `importFromDump(dumpPath, dbPath)` function in a new `data/import-logic.ts` module. The `import-data.ts` script becomes a thin wrapper calling this function with the real paths.

Test cases:
- Creates table with correct schema
- Inserts correct number of records
- Fields map to correct columns (NPI, last_name, classification, etc.)
- Duplicate NPIs are skipped (INSERT OR IGNORE)
- Indexes are created

Test file: `data/__tests__/import-integration.test.ts`

### Full-stack integration test

Verifies the complete wiring from MCP client through server, validation, and search to SQLite. Uses an in-memory database with test data and real (unmocked) modules. Tests both transport paths:

- **InMemoryTransport**: Client/Server round-trip covering tool listing, search results, validation errors, prefix matching, and AND logic
- **HTTP transport cross-verification**: Starts a real HTTP server via `startHttpServer()`, exercises the same queries over HTTP, and asserts results are identical to InMemoryTransport. Also verifies multiple HTTP sessions share the same database.

The database is set up once at module scope and shared across both `describe` blocks.

Test file: `src/__tests__/integration.test.ts`

## Step 5: HTTP transport tests

Test file: `src/__tests__/http.test.ts`

Tests exercise the Streamable HTTP transport via direct HTTP requests against a real HTTP server started on a random high port. Uses the same pattern as integration tests: mock `db.ts` with an in-memory SQLite database seeded with test data.

Test categories:
- **Routing**: 404 for unknown paths, 405 for unsupported methods
- **Request validation**: 400 for invalid JSON, 400 for missing session
- **Session lifecycle**: Initialize, tool calls, session termination
- **Tool behavior over HTTP**: Same results as over stdio
- **Error handling**: Invalid session IDs, JSON-RPC error responses

## Step 6: Add test script and verify
- Run `npx vitest run` to verify all tests pass
- Ensure no changes to existing runtime behavior

## Files to create/modify
- **New:** `vitest.config.ts` — minimal config
- **New:** `data/parse-values.ts` — extracted parseValues + COL + MIN_FIELDS
- **New:** `data/import-logic.ts` — extracted importFromDump(dumpPath, dbPath) function
- **Modified:** `data/import-data.ts` — thin wrapper calling importFromDump with real paths
- **New:** `data/__tests__/parse-values.test.ts` — unit tests for parser
- **New:** `src/__tests__/db.test.ts` — unit tests for db module
- **New:** `data/__tests__/import-integration.test.ts` — data import integration test
- **New:** `src/__tests__/integration.test.ts` — full-stack integration test (stdio + HTTP cross-verification)
- **New:** `src/__tests__/http.test.ts` — HTTP transport tests
- **Modified:** `package.json` — add vitest dep and test script
- **Modified:** `Dockerfile` — add `RUN npm test` **before** import-data

## Step 7: Update Dockerfile
Add `RUN npm test` in the builder stage **before** import-data, since all tests are self-contained:

```dockerfile
COPY data/ data/
RUN npm test
RUN npm run import-data
RUN npm run verify-data
```

## Verification
- `npm test` runs all tests and they pass
- `npm run import-data` still works (no regression from extracting parseValues)
- `docker build .` succeeds with tests passing
