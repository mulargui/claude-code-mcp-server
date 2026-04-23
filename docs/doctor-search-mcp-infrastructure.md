# Doctor Search MCP Server — Infrastructure

## Context

Project skeleton and container infrastructure for a TypeScript MCP server (`doctor-search` and `specialty-list` tools, SQLite-backed). No Node/npm required on the host; everything builds inside Docker.

## Decisions

- **Node 22** (`node:22-slim`), **npm**, **ES Modules**
- **tsx** for scripts, **tsc** for compilation
- **Multi-stage Docker build** — no host tooling required
- **Dual transport:** stdio + Streamable HTTP (both always active)
- SQL dump used only in build stage, discarded from final image
- Final image: compiled JS + production node_modules + doctors.db only

## Files

### `package.json`
- `"name": "doctor-search-mcp"`, `"version": "1.2.0"`, `"type": "module"`
- Scripts: `"build": "tsc"`, `"import-data": "tsx data/import-data.ts"`, `"start": "node dist/index.js"`
- Dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3`
- Dev dependencies: `typescript`, `@types/better-sqlite3`, `@types/node`, `tsx`

### `tsconfig.json`
- Target: `ES2022`, Module: `Node16`, outDir: `dist`, rootDir: `src`, strict

### `.gitignore`
- `node_modules/`, `dist/`, `data/doctors.db`

### Stub source files (`src/`)
Minimal compilable placeholders: `index.ts`, `types.ts`, `db.ts`, `validate.ts`, `search.ts`, `server.ts`

### `data/import-data.ts` (stub)
Placeholder — creates an empty `doctors.db` with the correct schema so the build succeeds. Functional parsing deferred.

### `Dockerfile` (multi-stage)

**Stage 1 — builder** (`node:22-slim`):
- Copy `package.json`, `package-lock.json` → `npm ci` (all deps)
- Copy `tsconfig.json`, `src/` → `npm run build`
- Copy `data/` (includes SQL dump + import script) → `npm run import-data`

**Stage 2 — runtime** (`node:22-slim`):
- Copy from builder: `package.json`, `node_modules/` (reinstalled with `--omit=dev`), `dist/`, `data/doctors.db`
- `EXPOSE $PORT` — exposes the HTTP transport port
- `CMD ["node", "dist/index.js"]`

SQL dump, TypeScript source, dev deps — all discarded. Final image is minimal.

### `.dockerignore`
- `node_modules/`, `dist/`, `data/doctors.db`, `.git/`, `docs/`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | HTTP transport listen port |

## Build & Run

```bash
# Build
docker build -t doctor-search-mcp .

# Run — stdio only (HTTP server runs inside but port is not mapped)
docker run -i --rm doctor-search-mcp

# Run — HTTP
docker run -p $PORT:$PORT --rm doctor-search-mcp

# Run — both externally accessible
docker run -i -p $PORT:$PORT --rm doctor-search-mcp
```

### MCP Client Configuration

**Stdio (subprocess):**
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

**HTTP (network):**
```json
{
  "mcpServers": {
    "doctor-search": {
      "url": "http://localhost:${PORT}/mcp"
    }
  }
}
```
