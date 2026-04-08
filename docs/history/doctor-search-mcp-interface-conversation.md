# Interface Definition — Conversation Log

## Prompt
we are building a MCP server. we wrote the spec and architecture in previous sessions in the /docs folder. in this session we want to define the external interface. look at the spec and architecture and write a interface file following the mcp protocol conventions. ask clarifying questions as needed.

## Clarifying Questions

**File location:** docs/interface.md (a markdown spec alongside the other docs, not code yet)

**Scope:** JSON Schema only (just the MCP tool definition as a JSON Schema object, no TypeScript types)

## Result

Created `docs/doctor-search-mcp-interface.md` covering:
- Server identity (name + version)
- Input schema as MCP-compatible JSON Schema with enum and pattern constraints, plus cross-field constraints enforced server-side
- Output structure with field-level docs
- Error messages for each validation case
- MCP protocol details (transport, capabilities, response format)

## Follow-ups

1. Renamed `interface.md` to `doctor-search-mcp-interface.md` to follow the `doctor-search-mcp-<topic>.md` naming convention used by other docs.
2. Added a tool description block designed for LLM consumption, returned in `tools/list`, explaining what the tool does, key constraints, and how prefix matching works.
