# Plan: Implement MCP Interface & Connect to Business Logic

## Context

The doctor-search MCP server has its business logic fully implemented (`validate.ts`, `search.ts`, `db.ts`, `types.ts`) but the MCP interface layer is stubbed out. We need to implement `server.ts` and `index.ts` to wire up the MCP protocol over stdio, plus write tests for both modules.

## Step 1: Implement `src/server.ts`

**File:** `src/server.ts`

Replace the empty `createServer()` stub. Use the low-level `Server` class (not `McpServer`) with `setRequestHandler` so we can provide the exact JSON Schema from the spec and use our own validation logic.

- **Change signature** from `createServer(): void` to `createServer(): Server` — returns the server instance so `index.ts` can connect a transport to it.
- **Imports:** `Server` from `@modelcontextprotocol/sdk/server/index.js`, `ListToolsRequestSchema` and `CallToolRequestSchema` from `@modelcontextprotocol/sdk/types.js`, plus local `validate` and `searchDoctors`.
- **Server instantiation:** `new Server({ name: "doctor-search", version: "1.0.0" }, { capabilities: { tools: {} } })`
- **`ListToolsRequestSchema` handler:** returns the single `doctor-search` tool with the exact JSON Schema from the interface doc (the four optional properties: lastname, specialty, gender, zipcode; `additionalProperties: false`).
- **`CallToolRequestSchema` handler:**
  1. Guard on tool name — return error for unknown tools.
  2. Cast `args` to `DoctorSearchInput`, call `validate(input)`.
  3. If validation error: return `{ content: [{ type: "text", text: errorMsg }], isError: true }`.
  4. Call `searchDoctors(input)` inside try/catch.
  5. On success: return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.
  6. On catch: return `{ content: [{ type: "text", text: "Internal error: please try again later." }], isError: true }`.

## Step 2: Implement `src/index.ts`

**File:** `src/index.ts`

Replace the `console.log` stub with the async `main()` entry point.

- **Imports:** `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`, `openDb`/`closeDb` from `./db.js`, `createServer` from `./server.js`.
- **`main()` async function:**
  1. `openDb()` — open the SQLite database.
  2. `const server = createServer()` — create the MCP server with tool registration.
  3. `const transport = new StdioServerTransport()` — create stdio transport.
  4. `await server.connect(transport)` — connect and start listening.
- **Graceful shutdown:** Register `SIGINT` and `SIGTERM` handlers that call `await server.close()`, `closeDb()`, then `process.exit(0)`.
- **Error handling:** `main().catch(...)` logs to stderr and exits with code 1.

## Step 3: Write tests for `src/server.ts`

**File:** `src/__tests__/server.test.ts`

Follow the existing test patterns (Vitest, `describe`/`it`/`expect`). Since `server.ts` depends on `db.ts` (via `searchDoctors`), tests will need to either mock the DB or set up a real in-memory DB.

**Approach:** Use `vi.mock` to mock `./validate.js` and `./search.js` so we test only the MCP wiring in isolation:
- `createServer()` returns a `Server` instance
- The tool list handler returns the `doctor-search` tool with correct schema
- The call handler returns validation errors with `isError: true` when `validate()` returns a string
- The call handler returns serialized `SearchResult` on success when `validate()` returns null
- The call handler returns "Internal error" with `isError: true` when `searchDoctors()` throws
- Unknown tool name returns an error

To invoke handlers in tests: use the MCP `Client` class from the SDK to connect to the server via an in-memory transport pair (`InMemoryTransport`).

## Step 4: Write tests for `src/index.ts`

**File:** `src/__tests__/index.test.ts`

`index.ts` is a top-level script with side effects, making it harder to unit test. We'll test it lightly:
- Verify the module can be imported without errors when DB and transport are mocked
- Verify `openDb()` is called during startup

Alternatively, skip isolated unit tests for `index.ts` and rely on the Docker build + a quick smoke test (send a JSON-RPC request via stdio and check the response) as the integration test for the entry point.

## Step 5: Verify via Docker build

Rebuild the Docker image to confirm everything compiles and tests pass:

```bash
docker build -t doctor-search-mcp .
```

Then smoke-test the running server by piping a JSON-RPC `tools/list` request via stdin:

```bash
echo '...' | docker run -i --rm doctor-search-mcp
```

## Files Modified

| File | Action |
|------|--------|
| `src/server.ts` | Rewrite — implement `createServer()` returning configured `Server` |
| `src/index.ts` | Rewrite — implement `main()` with DB, server, transport, shutdown |
| `src/__tests__/server.test.ts` | Create — unit tests for MCP tool registration and call handling |
| `src/__tests__/index.test.ts` | Create — light integration test for entry point (if feasible) |

## Verification

1. `docker build -t doctor-search-mcp .` succeeds (compiles + tests pass)
2. Smoke test: pipe a `tools/list` JSON-RPC message into the container, verify it returns the `doctor-search` tool
3. Smoke test: pipe a `tools/call` with `{ "lastname": "Smith" }`, verify it returns doctor records
