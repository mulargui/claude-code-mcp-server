# Doctor Search MCP Server — Infrastructure Conversation

## Goal

Build the container and infrastructure artifacts for the doctor-search MCP server. No functional code — stubs only. Functional coding deferred to later sessions.

## Key Decisions

- **Node 22** (`node:22-slim`), **npm**, **ES Modules** (`"type": "module"`)
- **tsx** for running TypeScript scripts, **tsc** for compilation
- **Multi-stage Docker build** — no Node/npm required on the host machine
- SQL dump used only in the Docker build stage, discarded from the final image
- Final image contains only: compiled JS, production `node_modules`, and `doctors.db`
- `data/import-data.ts` treated as functional code (stub for now, full implementation deferred)

## Discussion Points

1. **Node version**: User chose Node 22 over the originally spec'd Node 20.
2. **Package manager & module system**: npm + ES modules confirmed.
3. **TS tooling**: tsx + tsc (as originally in the architecture doc).
4. **Import script scope**: User clarified `import-data.ts` is functional, not infrastructure — so it was stubbed rather than fully implemented.
5. **SQL dump in container**: User asked to avoid copying `healthylinkxdump.sql` into the final container. Initially proposed a host-based build (import on host, copy only `doctors.db`), but that required Node/npm on the host.
6. **No host tooling requirement**: User wanted zero host dependencies. Solution: multi-stage Docker build where stage 1 handles everything (npm install, tsc, data import) and stage 2 copies only runtime artifacts. The SQL dump exists only in the discarded builder stage.

## Artifacts Created

| File | Purpose |
|------|---------|
| `package.json` | Project config — ESM, scripts for build/import/start |
| `tsconfig.json` | TypeScript config — ES2022, Node16 modules, strict |
| `.gitignore` | Ignores node_modules, dist, doctors.db |
| `src/index.ts` | Stub entry point (prints startup message) |
| `src/types.ts` | Type definitions (DoctorSearchInput, DoctorRecord, SearchResult) |
| `src/db.ts` | Stub database module |
| `src/validate.ts` | Stub validation module |
| `src/search.ts` | Stub search module |
| `src/server.ts` | Stub MCP server module |
| `data/import-data.ts` | Stub — creates empty doctors.db with correct schema |
| `Dockerfile` | Multi-stage build (builder + runtime) |
| `.dockerignore` | Excludes node_modules, dist, .git, docs |
| `docs/doctor-search-mcp-infrastructure.md` | Infrastructure documentation |

## Verification Results

- `docker build -t doctor-search-mcp .` — succeeds (TypeScript compiles, schema created, multi-stage produces clean image)
- `docker run --rm doctor-search-mcp` — prints "doctor-search-mcp server starting" and exits
- Final image size: 318MB (dominated by Node.js runtime and better-sqlite3 native module)
