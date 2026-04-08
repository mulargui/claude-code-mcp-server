# README.md and AGENTS.md — Session Summary

## Goal

Critique and update `README.md` and `AGENTS.md` to fix accuracy issues, reduce duplication, and optimize AGENTS.md for AI agent consumption.

## Critique

Reviewed both files against the actual codebase state. Key findings:

**README.md:**
- No indication the project is work-in-progress — reads as fully functional
- Quick Start and MCP Client Config are misleading (server is stubbed)
- No limitations section
- Documentation table duplicated with AGENTS.md

**AGENTS.md:**
- Repo structure tree doesn't distinguish stubbed vs implemented files
- MCP Client Config nested under wrong section
- Test files not listed by name
- Stubbed section lacks function signatures (agent won't know it's filling in existing bodies)
- Missing error handling conventions, SQLite LIKE behavior note, tsx dependency mention
- No mention of conversation/critique doc variants in docs/
- ~60% content overlap with README.md

## Changes Made

### README.md
- Added WIP status banner at top
- Added note under Quick Start that server won't process requests yet
- Added "(once the server is functional)" to MCP Client Config
- Added Limitations section (no first-name search, no state filter, no pagination, prefix-only)
- Replaced duplicated docs table with one-liner pointing to AGENTS.md

### AGENTS.md — First Pass
- Annotated 4 stubbed files with `[stub]` in repo tree
- Listed test files by name under both `__tests__/` directories
- Promoted MCP Client Configuration from `###` to `##`
- Expanded stubbed section with exact function signatures and return values
- Added SQLite case-insensitive LIKE note to schema section
- Added error flow and tsx conventions
- Added note about conversation/critique doc variants

### AGENTS.md — Second Pass (size optimization)
Assessed that AGENTS.md was reasonable at 191 lines but ~25% was low-value duplication. Cut:
- MCP Client Configuration block (already in README)
- Full database schema SQL (authoritative source: architecture doc)
- Full tool interface section — parameter table, output JSON example, error handling (authoritative source: spec doc)

Added in exchange:
- 3-line "Key details for implementers" with pointers to spec and architecture docs
- "Start here" implementation order: validate.ts → search.ts → server.ts → index.ts

Final result: 123 lines (~35% reduction), higher signal-to-noise ratio.

## Files Modified
- `README.md` — rewritten (101 → 101 lines, but substantially different content)
- `AGENTS.md` — rewritten (182 → 123 lines)

## Files Created
- `docs/doctor-search-mcp-readme-agents-critique.md` — detailed critique document
- `docs/doctor-search-mcp-readme-agents-conversation.md` — this file
