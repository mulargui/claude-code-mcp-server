# Doctor Search MCP Server — Data Import Critique Conversation

## Summary

Reviewed the data import implementation and produced a critique document (`doctor-search-mcp-data-import-critique.md`) identifying 7 issues and several non-blocking suggestions. Then fixed issues 1 through 4 and verified the build still passes.

## Critique

Full critique saved to `docs/doctor-search-mcp-data-import-critique.md`. Key findings:

1. **`TOTAL_COLUMNS` misleading name** — value was correct (19) but name/comment implied something different
2. **Fragile regex for INSERT parsing** — dotall regex could misbehave with multi-line statements
3. **`INSERT OR IGNORE` silently drops duplicates** — no logging or tracking of skipped records
4. **`db.ts` path assumes compiled directory** — no comment explaining the assumption
5. **`verify-data.ts` output interleaving** — cosmetic, not fixed
6. **No actual `\r` byte stripping** — only handles escape sequences, not fixed
7. **Dockerfile uses `node:22-slim` vs spec's `node:20-slim`** — not fixed

## Fixes Applied

### Issue 1: Renamed `TOTAL_COLUMNS` to `MIN_FIELDS`
- `data/import-data.ts` — Renamed constant to `MIN_FIELDS` with a clear comment: "Minimum number of fields expected per tuple (npidata2 has 19 columns: indices 0-18)"

### Issue 2: Replaced regex with line-by-line parsing
- `data/import-data.ts` — Removed the `insertRegex` with dotall/multiline flags. Replaced with `dump.split("\n")` loop that checks `line.startsWith(INSERT_PREFIX)` and slices off the prefix and trailing semicolon. Unambiguous, no regex edge cases.

### Issue 3: Track and log duplicate skips
- `data/import-data.ts` — Renamed `totalInserted` to `totalParsed`, added `totalSkipped` counter that increments when `result.changes === 0`. Logs both counts and prints a warning if duplicates were skipped.

### Issue 4: Added clarifying comment to `db.ts`
- `src/db.ts` — Added comment above `dbPath` explaining it assumes execution from `dist/db.js` and would break if run directly via `tsx` from `src/`.

## Verification

Docker build passed successfully:
- 85,737 records parsed and inserted, 0 duplicates skipped
- All 5 sanity checks passed (row count + 3 NPI spot checks)
- All 4 verification checks passed (row count, last name prefix, classification prefix, gender+zipcode filter)
