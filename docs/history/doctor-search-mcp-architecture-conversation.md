# Doctor Search MCP Server — Architecture Conversation Summary

## Goal

Design the architecture for the Doctor Search MCP server, building on the functional spec from the previous session.

## Key Decisions

1. **Datastore**: SQLite via `better-sqlite3` — lightweight, read-only, zero-config, ideal for a static dataset.
2. **Language**: TypeScript.
3. **Transport**: stdio (local only).
4. **Deployment**: Local only.
5. **Data import**: `data/import-data.ts` script converts the MySQL dump to SQLite. Colocated with the data files in `data/` rather than a separate `scripts/` folder.
6. **Project structure**: All files at the repo root (no wrapper folder). Source code in `src/`, data in `data/`, docs in `docs/`.
7. **Tables imported**: `npidata2` (as `doctors`) and `taxonomy` only. The `speciality` table is redundant (classification/specialization already inline in `npidata2`). The `transactions` table is ignored.
8. **Specialty mapping**: The `speciality` input filter matches against both `Classification` and `Specialization` columns in the data.
9. **Container**: Docker container using a multi-stage build on `node:20-slim`. Data import runs at build time so the SQLite DB is baked into the image. MCP clients launch the server via `docker run -i --rm` for stdio transport.

## Output

Architecture document written to `docs/doctor-search-mcp-architecture.md`.
