# Doctor Search MCP Server — HTTP Transport Feature Session

## Summary

Added Streamable HTTP transport support alongside existing stdio transport (v1.1.0 → v1.2.0). Both transports are always active simultaneously. The HTTP transport uses `StreamableHTTPServerTransport` from the MCP SDK on a `/mcp` endpoint, with per-session server isolation. No new dependencies — uses `node:http` and `node:crypto` built-ins.

## Changes Made

### Documentation Updates (Phase 1: Spec)

Updated existing docs to specify the HTTP transport feature before implementation:

| File | Changes |
|------|---------|
| `docs/doctor-search-mcp-spec.md` | Overview mentions dual transport |
| `docs/doctor-search-mcp-architecture.md` | Context, module responsibilities (server factory, new `http.ts`), dependencies, container section with `PORT` env var, dual run modes, both client configs |
| `docs/doctor-search-mcp-interface.md` | New Transports subsection documenting stdio and Streamable HTTP (endpoint, methods, sessions) |
| `docs/doctor-search-mcp-infrastructure.md` | Dual transport in decisions, `EXPOSE $PORT`, Environment Variables section, three run modes, both client configs |
| `AGENTS.md` | Project overview, repo structure (added `http.ts`), dual architecture diagram, module table, run commands, test suite description |

### Code Implementation (Phase 2)

| File | Action | Description |
|------|--------|-------------|
| `src/http.ts` | Created | HTTP server with `StreamableHTTPServerTransport`, session management, `/mcp` endpoint (POST/GET/DELETE), JSON body parsing, error responses |
| `src/index.ts` | Modified | Starts both stdio and HTTP transports, reads `PORT` env var (default 3000), shuts down both |
| `Dockerfile` | Modified | Added `EXPOSE 3000` |

### Test Updates (Phase 3)

| File | Action | Description |
|------|--------|-------------|
| `src/__tests__/http.test.ts` | Created | 10 tests: routing (404, 405), request validation (invalid JSON, missing session), session creation, tool calls, specialty-list, validation errors, session termination, multi-session independence |
| `src/__tests__/integration.test.ts` | Modified | Added 2 HTTP integration tests: cross-transport result comparison (HTTP vs InMemoryTransport), multi-session shared DB verification. Moved DB setup to module scope. |

### Test Documentation Updates (Phase 4)

| File | Changes |
|------|---------|
| `docs/doctor-search-mcp-testing.md` | Added Step 5 (HTTP transport tests), added `integration.test.ts` description, added files to list |
| `docs/doctor-search-mcp-acceptance-tests.md` | Added Section 27 (HTTP Transport, 10 tests), updated total from 141 to 151, updated overview |
| `docs/doctor-search-mcp-acceptance-tests-implementation.md` | Updated counts, added section 27 to table, documented two-file approach, added key files |

### Version Bump (Phase 5)

Updated `1.1.0` → `1.2.0` in: `package.json`, `src/server.ts`, `docs/doctor-search-mcp-interface.md`, `docs/doctor-search-mcp-infrastructure.md`, `docs/doctor-search-mcp-acceptance-tests.md`. Left `docs/history/` files untouched (historical records).

### Critiques (Phase 6)

Two critique documents generated and saved:

- `docs/history/doctor-search-mcp-http-product-critique.md` — PM review identifying 9 issues: broken `$PORT` notation in examples, `EXPOSE $PORT` mismatch with Dockerfile, transport details in spec doc, missing "why", security implications, stale acceptance test overview, missing session lifecycle docs, test count presentation, stale architecture structure tree
- `docs/history/doctor-search-mcp-http-engineering-critique.md` — Principal engineer review identifying 12 issues: session memory leak, no body size limit, non-graceful shutdown, `httpServer.close()` not awaited, PORT not validated, URL parsing outside try/catch, header type assumption, stale JSDoc, missing invalid session test, port collision risk, `initSession()` helpers missing status checks, duplicated schema SQL

## Key Design Decisions

- **Dual mode always active**: No config switch. HTTP port is simply inaccessible if not mapped in Docker.
- **No new dependencies**: `StreamableHTTPServerTransport` from existing SDK; HTTP server uses `node:http`.
- **Server factory pattern**: `createServer()` in `server.ts` was already a factory — no signature change needed. Each HTTP session gets an independent server instance.
- **`enableJsonResponse: true`**: Direct JSON responses instead of SSE, appropriate for a server with no streaming tools.
- **`PORT` env var**: Configurable HTTP port, default 3000, referenced via env var in docs (not hardcoded).

## Final State

- **298 tests passing** (141 acceptance + 10 HTTP transport + 7 integration + 13 server + 57 validate + 50 search + 3 db + 11 parser + 6 import)
- **Docker build succeeds** (compile, test, import, verify)
- **Version**: 1.2.0
