# AGENTS.md

## Project Overview

Doctor Search MCP Server — a TypeScript MCP server that exposes two tools: `doctor-search` for searching US doctors by last name, specialty, gender, and/or zip code, and `specialty-list` for retrieving the list of available medical specialties. Uses SQLite as its datastore and communicates over stdio transport. Runs inside Docker.

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
│   └── __tests__/
│       ├── db.test.ts              # DB module lifecycle tests
│       ├── validate.test.ts        # Input validation unit tests
│       ├── search.test.ts          # Search query builder unit tests
│       ├── server.test.ts          # MCP server integration tests
│       ├── integration.test.ts     # Full-stack integration tests
│       └── acceptance.test.ts      # Comprehensive acceptance tests (141 tests)
├── data/
│   ├── healthylinkxdump.sql  # Source MySQL dump (~85k records)
│   ├── doctors.db            # Generated SQLite DB (gitignored)
│   ├── import-data.ts        # Production import wrapper
│   ├── import-logic.ts       # Core MySQL-to-SQLite import function
│   ├── parse-values.ts       # MySQL VALUES clause parser
│   ├── verify-data.ts        # Post-import verification
│   └── __tests__/
│       ├── parse-values.test.ts       # VALUES parser unit tests
│       └── import-integration.test.ts # Import pipeline integration tests
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

## Architecture

```
MCP Client → stdio → index.ts → server.ts → validate.ts → search.ts → db.ts → SQLite
```

### Module Responsibilities

| Module         | Role |
|----------------|------|
| `index.ts`     | Opens DB, creates MCP server, connects stdio transport, handles shutdown |
| `server.ts`    | Instantiates MCP `Server`, registers `doctor-search` and `specialty-list` tools, routes tool calls |
| `validate.ts`  | Validates filter combination rules and individual field constraints |
| `search.ts`    | Builds parameterized SQL queries, executes against SQLite, maps results; lists distinct specialties |
| `db.ts`        | Opens/closes SQLite in read-only mode as a singleton |
| `types.ts`     | Defines `DoctorSearchInput`, `DoctorRecord`, `SearchResult`, `SpecialtyListResult` interfaces |

### Database & Tool Interface

See `docs/doctor-search-mcp-architecture.md` for the full schema and `docs/doctor-search-mcp-spec.md` for the complete tool interface (parameters, validation rules, output format, error handling).

Key details for implementers:
- SQLite's `LIKE` is case-insensitive for ASCII by default — prefix matching relies on this
- `specialty` parameter maps to both `classification` and `specialization` columns
- Results capped at 50; `total_count` reflects the true total

## Implementation Status

All modules are fully implemented and tested.

- Data import pipeline (`data/`): MySQL dump parser, SQLite import, verification
- Database module (`src/db.ts`): read-only singleton connection
- Type definitions (`src/types.ts`): all interfaces
- Validation (`src/validate.ts`): combination rules and individual field constraints
- Search (`src/search.ts`): dynamic WHERE clause builder, parameterized queries, specialty resolution, specialty listing
- Server (`src/server.ts`): MCP server with tool registration and call handler
- Entry point (`src/index.ts`): DB init, server creation, stdio transport, graceful shutdown
- Test suite: unit tests (validate, search, db, parser), integration tests (server, import pipeline), acceptance tests (141 tests across 26 categories)
- Infrastructure: Dockerfile, package.json, tsconfig.json, vitest config
- Documentation: full spec, architecture, interface, testing, and acceptance test docs in `docs/`

## Conventions

- **ES modules** — `"type": "module"` in package.json; use `.js` extensions in imports
- **Strict TypeScript** — ES2022 target, Node16 module resolution, strict mode enabled
- **Tests** — Vitest; test files live in `__tests__/` directories alongside source
- **SQL safety** — always use parameterized queries, never string interpolation
- **Read-only DB** — SQLite opened in read-only mode at runtime; data imported at build time
- **File headers** — each source file starts with a JSDoc comment block describing the module
- **Error flow** — `validate()` returns `null` on success or an error message string on failure; `server.ts` maps error strings to MCP responses with `isError: true`; internal/unexpected errors return `"Internal error: please try again later."`
- **`tsx` for scripts** — data import and verification scripts run via `tsx` (TypeScript execution without prior compilation), listed as a dev dependency

## Documentation

| File | Contents |
|------|----------|
| `docs/doctor-search-mcp-spec.md` | Functional spec: tool interface, parameters, validation, examples |
| `docs/doctor-search-mcp-architecture.md` | System design: datastore, schema, module responsibilities, data flow |
| `docs/doctor-search-mcp-interface.md` | MCP protocol details: server info, input schema, output format, errors |
| `docs/doctor-search-mcp-data-import.md` | Data import strategy and implementation |
| `docs/doctor-search-mcp-infrastructure.md` | Docker, config, deployment |
| `docs/doctor-search-mcp-testing.md` | Test strategy and categories |
| `docs/doctor-search-mcp-acceptance-tests.md` | Comprehensive acceptance test spec (141 tests across 26 categories) |
| `docs/doctor-search-mcp-specialty-list-implementation.md` | Specialty-list feature implementation plan |

Design discussion history (`*-conversation.md`) and review feedback (`*-critique.md`) live in `docs/history/`.
