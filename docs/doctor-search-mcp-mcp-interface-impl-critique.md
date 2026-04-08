# Doctor Search MCP Server — MCP Interface Implementation Critique

## Bugs

### 1. Signal handlers don't exit the process (`src/index.ts:18-19`)

The `SIGINT`/`SIGTERM` handlers call `shutdown()` but don't `await` the result and never call `process.exit()`. Registering a handler for `SIGINT` overrides the default behavior (terminate), so the process will hang after cleanup completes.

```typescript
// Current — fire-and-forget async, no exit
process.on("SIGINT", () => { shutdown(); });

// Should be
process.on("SIGINT", async () => { await shutdown(); process.exit(0); });
```

### 2. No error handling on startup (`src/index.ts:9`)

If `openDb()` throws (missing DB file, permissions, corrupt file), it becomes an unhandled promise rejection — no error message, unclear exit behavior. `main()` needs a catch that logs to stderr and exits non-zero.

### 3. Unsafe type cast of tool arguments (`src/server.ts:41`)

```typescript
const input = (request.params.arguments ?? {}) as DoctorSearchInput;
```

The MCP SDK doesn't enforce the JSON Schema at runtime. A client could send `{ lastname: 123 }` or `{ lastname: null }`. The `validate()` function happens to catch most of these by accident (regex coercion, length checks on non-strings), but it's fragile. A type guard or explicit string-type check before handing off to `validate()` would be more robust.

## Correctness Concerns

### 4. `LIMIT` interpolated rather than parameterized (`src/search.ts:77`)

```typescript
`... LIMIT ${RESULT_LIMIT}`
```

`RESULT_LIMIT` is a constant so there's no injection risk, but it breaks the convention established everywhere else in the file. Using `LIMIT ?` with the value appended to params would be consistent and future-proof.

### 5. `searchDoctors` has no guard against empty filters (`src/search.ts:56`)

If called without prior validation (e.g., a future code path), the empty `whereClause` produces a full table scan on ~85k rows, returning all of them. The function relies entirely on `validate()` having been called upstream. A defensive check or an assertion at the top would be cheap insurance.

## Test Gaps

### 6. No test for unknown tool name (`src/__tests__/server.test.ts`)

`server.ts:37-40` handles `request.params.name !== "doctor-search"` but no test exercises this branch. Easy to add via the in-memory client.

### 7. No integration test for `index.ts`

The entry point — the actual wiring of DB + server + transport + shutdown — has zero test coverage. It's the one place where a wiring mistake (wrong import, wrong call order) would only surface in the Docker build. A test that opens an in-memory DB, creates the server, and verifies a round-trip call would catch regressions early.

## Minor / Style

### 8. No observability at all

There's no startup message, no error logging, nothing. Since this is a stdio server, `console.log` can't be used (it's the transport), but `console.error` is available and conventional for MCP stdio servers. A single `console.error("doctor-search-mcp started")` on startup and error logging in the catch block would help with debugging.

### 9. `resolveSpecialty` tiebreaker rule is underdocumented

The logic for choosing between classification and specialization when no specialty filter is provided (longer wins, classification wins ties) is correct per the spec but the function has no comment explaining the business rule. Someone reading this later would have to cross-reference the spec to understand why.

## What's Done Well

- **Validation ordering** is exactly right — combination rules first, then field-by-field in deterministic order. Matches the spec.
- **SQL safety** — parameterized queries throughout (except the LIMIT constant). The `LIKE ? || '%'` pattern is the correct way to do prefix matching with bound params.
- **Test coverage on `validate.ts` and `search.ts`** — thorough edge cases, ordering assertions, tiebreaker tests, result cap tests. These are strong.
- **`server.test.ts` architecture** — using `InMemoryTransport` with a real MCP client is the right approach, testing through the protocol layer rather than calling handler functions directly.
- **Clean module boundaries** — each module has a single responsibility, the dependency flow is one-directional, and the types file is appropriately minimal.
- **Error flow** — validation errors vs. internal errors are correctly separated with different response shapes, matching the spec exactly.

## Summary

The core business logic (validate, search, specialty mapping) is solid and well-tested. The issues concentrate in the entry point (`index.ts`) where signal handling and error handling need fixes — these are the kind of bugs that only show up in production when a container orchestrator sends SIGTERM and the process doesn't exit cleanly. The type safety gap in `server.ts` is worth addressing before this goes to production with untrusted clients.
