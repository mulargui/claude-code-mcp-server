# Doctor Search MCP Server — Architecture Critique

## Critical Issues

**1. State filter is missing from the schema despite being available in the source data**

The MySQL dump has `Provider_Business_Practice_Location_Address_State_Name` but the architecture drops it entirely. The spec critique already flagged this as important ("Find me a cardiologist in California"), and the architecture should have addressed it. Add a `state` column to the `doctors` table and an index on it.

**2. No prefix/partial matching on `lastname` — but the architecture commits to exact equality**

`search.ts` is described as doing "direct equality checks" for all filters. The spec critique called out that exact-match-only on lastname makes the tool fragile for LLM callers. The architecture should specify `LIKE ? || '%'` for `lastname` (prefix match) or at minimum acknowledge this decision and why.

**3. The `specialty` filter searches both `classification` and `specialization` — but the output only returns a single `specialty` field**

The spec output has one `specialty` column, but the architecture stores `classification` and `specialization` separately (correctly). The architecture never specifies how these two columns map back to the single `specialty` output field. Which one is returned? Both concatenated? This ambiguity will cause bugs.

## Design Concerns

**4. Validation hits the database but `search.ts` also hits the database — no clear transaction boundary**

`validate.ts` checks that a specialty exists in the `taxonomy`/`specializations` tables, then `search.ts` runs the actual query. These are two separate DB reads with no shared context. This isn't a correctness problem (read-only DB), but it's an unnecessary extra round-trip. The validation lookup could be done once at startup (load all valid specialties into a `Set`) since the data is static.

**5. The `taxonomy` and `specializations` tables duplicate what's already in `doctors`**

You maintain three separate tables that all contain specialty information. The `taxonomy` table holds classifications, the `specializations` table holds specializations, and the `doctors` table has both inline. Since the DB is read-only and built from the same source, you could just `SELECT DISTINCT classification FROM doctors` at startup instead of maintaining separate tables. Simpler schema, less import logic, same result.

**6. No `firstname` in the tool input**

The architecture faithfully implements the spec's omission, but it should have pushed back. The data has first names, the output returns them, and "Find Dr. John Smith" is a natural query. Adding it is trivial — one more equality filter.

**7. The import script uses regex to parse SQL INSERT statements**

Parsing SQL with regex is fragile. If the dump has escaped quotes, multi-line values, or unusual formatting, the regex will silently drop or corrupt records. The architecture should acknowledge this risk and specify which regex patterns are used, or better, use a lightweight SQL parser. At minimum, add a post-import sanity check (expected row count, spot-check known records).

## Minor Issues

**8. No index on `city`**

City is stored but not indexed and not searchable. If city isn't a filter, fine — but then why store it at all except as display data? If it might become a filter later, the architecture should note that.

**9. `LIMIT 50` is hardcoded with no "more results" signal**

The architecture says `LIMIT 50` but doesn't specify whether the response indicates truncation. The client (LLM) has no way to know if it got all results or just the first 50. Add a `truncated: boolean` or `total_count` field.

**10. The Dockerfile multi-stage build bakes in `data/doctors.db` — but the architecture doesn't specify `.dockerignore`**

There's a `.dockerignore` in the file tree but no specification of its contents. If `data/doctors.db` isn't ignored, you'll copy a stale DB into the build context and then regenerate it anyway, wasting build time and potentially shipping stale data.

**11. Graceful shutdown is mentioned but not specified**

`index.ts` "handles graceful shutdown (close DB)" — but what signals? SIGTERM? SIGINT? Both? In a Docker container, this matters because `docker stop` sends SIGTERM.

**12. No error handling strategy for the import script**

What happens if the MySQL dump is malformed or missing? The import script's failure mode isn't defined. A build that silently produces an empty `doctors.db` would be worse than a build that crashes.

## Summary

The architecture is clean and well-structured for what it covers. The module decomposition makes sense, the tech choices (better-sqlite3, stdio transport) are appropriate, and the data flow is simple. The biggest gaps are: (1) not incorporating the spec critique's feedback (state filter, prefix matching, specialty discoverability), (2) the ambiguous `specialty` ↔ `classification`/`specialization` mapping in the output, and (3) the regex-based SQL parsing being a reliability risk. I'd resolve these before building.
