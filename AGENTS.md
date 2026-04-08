# AGENTS.md

## Project Overview

Doctor Search MCP Server — a TypeScript MCP server that exposes a single tool (`doctor-search`) for searching US doctors by last name, specialty, gender, and/or zip code. Uses SQLite as its datastore and communicates over stdio transport. Runs inside Docker.

**Stack:** TypeScript, `@modelcontextprotocol/sdk`, `better-sqlite3`, Vitest, Docker (Node 22-slim)

## Repository Structure

```
├── Dockerfile              # Multi-stage build (build + lean runtime)
├── package.json            # Scripts, dependencies
├── tsconfig.json           # ES2022, Node16 modules, strict mode
├── vitest.config.ts        # Test runner config
├── CLAUDE.md               # Claude Code instructions
├── AGENTS.md               # This file
├── src/
│   ├── index.ts            # Entry point: open DB, start server, stdio transport
│   ├── server.ts           # MCP server setup, tool registration, call handler
│   ├── db.ts               # SQLite connection manager (read-only singleton)
│   ├── search.ts           # Query builder & executor
│   ├── validate.ts         # Input validation
│   ├── types.ts            # Shared TypeScript interfaces
│   └── __tests__/          # Unit tests for src/ modules
├── data/
│   ├── healthylinkxdump.sql  # Source MySQL dump (~85k records)
│   ├── doctors.db            # Generated SQLite DB (gitignored)
│   ├── import-data.ts        # Production import wrapper
│   ├── import-logic.ts       # Core MySQL-to-SQLite import function
│   ├── parse-values.ts       # MySQL VALUES clause parser
│   ├── verify-data.ts        # Post-import verification
│   └── __tests__/            # Import pipeline tests
└── docs/                     # Design documents (spec, architecture, interface, etc.)
```

## Build & Run

All build and run commands execute inside Docker. There are no local build prerequisites beyond Docker itself.

```bash
# Build image (compiles TS, runs tests, imports data, verifies DB)
docker build -t doctor-search-mcp .

# Run the MCP server
docker run -i --rm doctor-search-mcp
```

The Dockerfile multi-stage build handles everything: `npm install`, `tsc`, `vitest run`, data import, and verification. The runtime image contains only compiled JS, production `node_modules`, and the SQLite database.

### MCP Client Configuration

```json
{
  "mcpServers": {
    "doctor-search": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "doctor-search-mcp"]
    }
  }
}
```

## Architecture

```
MCP Client → stdio → index.ts → server.ts → validate.ts → search.ts → db.ts → SQLite
```

### Module Responsibilities

| Module         | Role |
|----------------|------|
| `index.ts`     | Opens DB, creates MCP server, connects stdio transport, handles shutdown |
| `server.ts`    | Instantiates MCP `Server`, registers `doctor-search` tool, routes tool calls |
| `validate.ts`  | Validates filter combination rules and individual field constraints |
| `search.ts`    | Builds parameterized SQL queries, executes against SQLite, maps results |
| `db.ts`        | Opens/closes SQLite in read-only mode as a singleton |
| `types.ts`     | Defines `DoctorSearchInput`, `DoctorRecord`, `SearchResult` interfaces |

### Database Schema

```sql
CREATE TABLE doctors (
  npi            TEXT PRIMARY KEY,
  last_name      TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  classification TEXT,
  specialization TEXT,
  gender         TEXT,    -- "M" or "F"
  address        TEXT,
  city           TEXT,
  zipcode        TEXT,    -- 5 digits
  phone          TEXT     -- 10 digits, no formatting
);

CREATE INDEX idx_last_name      ON doctors(last_name);
CREATE INDEX idx_classification ON doctors(classification);
CREATE INDEX idx_specialization ON doctors(specialization);
CREATE INDEX idx_gender         ON doctors(gender);
CREATE INDEX idx_zipcode        ON doctors(zipcode);
```

## Tool Interface: `doctor-search`

### Input Parameters

All parameters are optional strings, but at least one must be provided and at least `lastname` or `specialty` must be included.

| Parameter   | Match Type | Validation |
|-------------|------------|------------|
| `lastname`  | Prefix, case-insensitive | 3+ chars, alphabetic + hyphens only |
| `specialty` | Prefix, case-insensitive (matches both `classification` and `specialization` columns) | 3+ chars, alphabetic + spaces + hyphens only |
| `gender`    | Exact | `male`, `female`, `M`, or `F` (normalized to M/F internally) |
| `zipcode`   | Exact | Exactly 5 digits |

Multiple filters combine with AND logic.

### Output

```json
{
  "total_count": 142,
  "doctors": [
    {
      "npi": "1234567890",
      "lastname": "Smith",
      "firstname": "John",
      "specialty": "Internal Medicine",
      "gender": "M",
      "address": "123 Main St",
      "city": "Los Angeles",
      "zipcode": "90210",
      "phone": "3105551234"
    }
  ]
}
```

Results are capped at 50 records. `total_count` reflects the true total (may exceed 50).

### Error Handling

Validation errors return `isError: true` with a descriptive message. Zero results are not errors (returns empty `doctors` array with `total_count: 0`). Internal errors return `"Internal error: please try again later."`.

## Implementation Status

### Complete
- Data import pipeline (`data/`): MySQL dump parser, SQLite import, verification
- Database module (`src/db.ts`): read-only singleton connection
- Type definitions (`src/types.ts`): all interfaces
- Test suite: unit tests for parser and DB, integration tests for import pipeline
- Infrastructure: Dockerfile, package.json, tsconfig.json, vitest config
- Documentation: full spec, architecture, interface, testing, and acceptance test docs in `docs/`

### Stubbed (not yet implemented)
- `src/index.ts` — needs: open DB, create server, connect stdio, graceful shutdown
- `src/server.ts` — needs: instantiate MCP `Server`, register tool with JSON schema, implement call handler
- `src/search.ts` — needs: dynamic WHERE clause builder, parameterized queries, COUNT query, LIMIT 50, specialty field mapping
- `src/validate.ts` — needs: combination rules, individual field validation, descriptive error messages

## Conventions

- **ES modules** — `"type": "module"` in package.json; use `.js` extensions in imports
- **Strict TypeScript** — ES2022 target, Node16 module resolution, strict mode enabled
- **Tests** — Vitest; test files live in `__tests__/` directories alongside source
- **SQL safety** — always use parameterized queries, never string interpolation
- **Read-only DB** — SQLite opened in read-only mode at runtime; data imported at build time
- **File headers** — each source file starts with a JSDoc comment block describing the module

## Documentation

| File | Contents |
|------|----------|
| `docs/doctor-search-mcp-spec.md` | Functional spec: tool interface, parameters, validation, examples |
| `docs/doctor-search-mcp-architecture.md` | System design: datastore, schema, module responsibilities, data flow |
| `docs/doctor-search-mcp-interface.md` | MCP protocol details: server info, input schema, output format, errors |
| `docs/doctor-search-mcp-data-import.md` | Data import strategy and implementation |
| `docs/doctor-search-mcp-infrastructure.md` | Docker, config, deployment |
| `docs/doctor-search-mcp-testing.md` | Test strategy and categories |
| `docs/doctor-search-mcp-acceptance-tests.md` | Comprehensive acceptance test spec (99 tests across 13 categories) |
