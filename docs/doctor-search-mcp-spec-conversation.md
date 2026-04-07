# Doctor Search MCP Server — Spec Conversation Summary

## Goal

Write a functional spec for an MCP server with a single tool for searching doctors.

## Key Decisions

1. **Tool name**: `doctor-search`
2. **Search filters**: `lastname`, `speciality`, `gender`, `zipcode` — all optional strings, combined with AND logic.
3. **Filter constraints**: At least one filter required; at least `lastname` or `speciality` must be included.
4. **Input validation**: All fields validated before search is performed. Gender accepts: `male`, `female`, `M`, `F`.
5. **Output fields**: `lastname`, `firstname`, `speciality`, `gender`, `address`, `city`, `zipcode`, `phone`.
6. **Data source and architecture**: Deferred to a future discussion.

## Output

Spec written to `docs/doctor-search-mcp-spec.md`.
