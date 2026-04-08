# Doctor Search MCP Server — AGENTS.md & README.md Session

## Goal

Create two documentation files for the repo root:
- `AGENTS.md` — orientation file for LLMs inspecting or working in the repo
- `README.md` — human-facing project overview

## AGENTS.md

Explored the full codebase (src/, data/, docs/, config files) to understand the project structure, implementation status, and conventions. Drafted a plan covering 8 sections:

1. Project Overview
2. Repository Structure
3. Build & Run (Docker-only — all commands run inside containers)
4. Architecture (data flow, module responsibilities table, database schema)
5. Tool Interface (input parameters, output format, error handling)
6. Implementation Status (complete vs. stubbed modules)
7. Conventions (ES modules, strict TS, test location, SQL safety, file headers)
8. Documentation pointers (table of docs/ files)

**Key decisions during planning:**
- Build & run commands are Docker-only — no local npm commands exposed
- Verification step also runs inside Docker (`docker build` runs tests, import, and verification)
- Plan was saved to `docs/doctor-search-mcp-agents-md.md` per user request

`CLAUDE.md` imports `AGENTS.md` via `@AGENTS.md` so Claude Code loads it automatically.

## README.md

Created a human-facing README with:

1. Title + one-line description
2. What is this? — MCP explanation with link, data source, how it runs
3. Quick Start — prerequisites (Docker) and two commands
4. MCP Client Configuration — copy-paste JSON snippet
5. Tool documentation — parameters table with match types and validation rules, example inputs and response
6. Documentation links — table pointing to each doc in `docs/`

## Files Created

- `AGENTS.md` (repo root)
- `README.md` (repo root)
- `docs/doctor-search-mcp-agents-md.md` (plan document)

## Verification

Docker build passed after each file was created — all cached layers, no breakage.
