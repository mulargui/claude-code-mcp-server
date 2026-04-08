# Doctor Search MCP Server — Spec Critique Conversation

## Summary

A PM review of the functional spec and architecture docs, followed by a series of changes based on the critique findings.

## Critique

The spec was reviewed for completeness and usability. A full critique was saved to `doctor-search-mcp-spec-critique.md` covering 14 issues across critical, important, moderate, and minor categories. Key concerns included: no result pagination, the `speciality` typo, missing "no results" behavior, exact-match-only search, missing state filter, opaque specialty validation, and NPI not being returned in results.

## Changes Made

1. **Result limit** — Added a 50-record cap to search results in the spec. Updated the architecture doc to reflect `LIMIT 50` in the query builder and smoke queries.

2. **Typo fix (`speciality` → `specialty`)** — Renamed the API parameter from `speciality` to `specialty` across both spec and architecture docs. Preserved the original `speciality` spelling where it refers to the actual MySQL table name in the source dump.

3. **NPI in output** — Added `npi` (National Provider Identifier) as the first field in the spec's output table so clients can use it as a unique key. Updated the architecture doc's `DoctorRecord` type accordingly.
