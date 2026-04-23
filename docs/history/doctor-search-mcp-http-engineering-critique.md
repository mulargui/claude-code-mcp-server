# Doctor Search MCP Server — HTTP Transport Engineering Critique

## Context

Principal engineer review of the code changes to implement HTTP transport support (v1.2.0). The feature adds Streamable HTTP transport alongside stdio, both active simultaneously.

---

## What's done well

- **Clean module boundary**: `http.ts` is self-contained. `server.ts` didn't need changes — `createServer()` was already a factory. `index.ts` changes are minimal. Good separation.
- **Per-session server isolation**: Each HTTP session gets its own `Server` instance, preventing cross-session state contamination.
- **No new dependencies**: `node:http` and `node:crypto` are built-in. No Express overhead.
- **`enableJsonResponse: true`**: Right choice for a server with no streaming tools.
- **Cross-transport integration test**: The test that compares HTTP vs InMemoryTransport results for the same query is high-value — it proves transport-agnostic correctness.

---

## Issues

### 1. Session memory leak — no cleanup for abandoned sessions

`http.ts:14` — the `transports` Map grows forever. Sessions are only removed when `transport.onclose` fires (client sends DELETE). If a client disconnects without DELETE (crash, network failure, browser tab closed), the session and its entire `Server` instance stay in memory permanently.

This is the most significant issue. A long-running HTTP server will slowly consume memory. Needs either session TTLs or an idle timeout that closes and removes sessions after inactivity.

### 2. No request body size limit

`http.ts:16-23` — `readBody()` collects the entire request body into memory with no size cap. A client can send a multi-gigabyte POST and exhaust the process. Should bail out after a reasonable limit (e.g., 1MB).

### 3. Shutdown doesn't close active sessions

`index.ts:25` — `httpServer.close()` stops accepting new connections but doesn't clean up the `transports` Map. Active sessions and their Server instances aren't closed. The `process.exit(0)` on line 27 kills everything anyway, but it's not a graceful shutdown — in-flight requests get dropped silently.

### 4. `httpServer.close()` isn't awaited

`index.ts:25` — `httpServer.close()` is async (takes a callback) but it's called fire-and-forget. Then `process.exit(0)` runs on line 27 before the HTTP server has actually stopped. Compare with the test teardown which correctly wraps it in a Promise. The shutdown function should await the close.

### 5. PORT not validated

`index.ts:19` — `parseInt(process.env.PORT ?? "3000", 10)` doesn't check the result. `PORT=banana` produces `NaN`, which gets passed to `httpServer.listen(NaN)`. Should validate the parsed port is a finite number in a valid range, or fail fast.

### 6. URL parsing can throw outside try/catch

`http.ts:82` — `new URL(req.url ?? "/", ...)` is outside the try/catch on line 86. If `req.url` contains characters that make URL parsing throw, the error becomes an unhandled rejection in the async request handler. Should wrap the entire handler body.

### 7. HTTP header type assumption

`http.ts:49` — `req.headers["mcp-session-id"] as string | undefined`. HTTP headers can be `string | string[] | undefined` if a client sends the header multiple times. The `as string` cast silently passes a string array through. Should normalize (e.g., take the first element if array).

### 8. `server.ts` JSDoc is stale

`server.ts:3-6` — Still says "Creates and configures the MCP server instance" (singular). The architecture docs describe this as a factory. The JSDoc should match.

### 9. No test for invalid/expired session ID

The test suite verifies that a missing session ID returns 400, but doesn't test what happens when a client sends a session ID that doesn't exist in the map (e.g., fabricated or from a terminated session). This is a distinct code path — it falls through to the 400 at the bottom of `handleMcp()`, but it's not verified.

### 10. Test port collision risk

Both `http.test.ts:20` and `integration.test.ts:146` use `49152 + Math.floor(Math.random() * 1000)`. In parallel test runs, there's a small but real chance of collision. Using port `0` (OS-assigned) and reading the actual port from `httpServer.address()` after listening would be deterministic.

### 11. `initSession()` helpers don't check response status

Both `http.test.ts:117` and `integration.test.ts:166` — the `initSession()` helpers use `res.headers.get("mcp-session-id")!` without first asserting `res.status === 200`. If initialization fails, the non-null assertion silently passes `null` as a session ID, and subsequent tests fail with confusing downstream errors instead of at the point of failure.

### 12. Schema SQL duplicated across test files

The CREATE TABLE + indexes schema appears in three test files (`http.test.ts`, `integration.test.ts`, `acceptance.test.ts`). If the schema changes, all three must be updated in sync. Should extract to a shared test utility.

---

## Summary

The design is sound — clean module boundary, per-session isolation, no new deps, good test structure. The main concerns are operational: session leak under real-world conditions, missing body size limit, and non-graceful shutdown. These don't matter for a Docker container that gets replaced, but they would matter for a long-running deployment serving multiple clients over HTTP, which is the use case this feature enables.
