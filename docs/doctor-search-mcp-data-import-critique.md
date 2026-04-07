# Doctor Search MCP Server — Data Import Critique

## What's Done Well

- **State machine parser** — The character-by-character approach in `parseValues()` is the right call for MySQL dump parsing. It correctly handles escaped quotes (`\'`), literal `\r` and `\n` sequences, escaped backslashes, and NULL values.
- **Performance-conscious** — Creating indexes after bulk insert, using transactions for batch inserts, and WAL mode are all good choices.
- **Post-import sanity checks** — The row count range check and spot-checking known NPIs is solid. The script fails loudly with `process.exit(1)`, which means the Docker build will break on bad data.
- **Verify script is independent** — It opens the DB directly rather than going through `src/db.ts`, which is good for isolation.
- **Dockerfile structure** — Multi-stage build, verify runs right after import, runtime image is lean.

## Issues

### 1. `TOTAL_COLUMNS` is wrong — silent data loss risk
`import-data.ts:40` sets `TOTAL_COLUMNS = 19`, and line 113 filters with `fields.length >= TOTAL_COLUMNS`. But the column indices go from 0 to 18, meaning you need *at least 19 fields*. The actual MySQL dump likely has *more* than 19 columns per row (the spec mentions column indices up to 18, but the actual `npidata2` table probably has 20+ columns). If a tuple happens to have exactly 19 fields but the dump has more, parsing would be wrong. This constant should reflect the *actual* number of columns in the dump, not the max index + 1. Right now it works only because tuples have more than 19 fields and `>=` is used — but the name and intent are misleading.

### 2. Regex for INSERT parsing may be greedy across statements
`import-data.ts:162` — The regex `(.*?);$` with the `s` flag (dotall) and `m` flag (multiline) anchors `$` at end-of-line. If two INSERT statements are on consecutive lines, this works. But if the dump has multi-line INSERT statements (which is common), the `.*?` with dotall could match across statement boundaries or fail to capture correctly. This is fragile — a more robust approach would be to match `INSERT INTO \`npidata2\` VALUES` and then find the corresponding `;` using the same state-machine logic that already handles quoted strings.

### 3. `INSERT OR IGNORE` silently drops duplicates
`import-data.ts:156` — If the dump has duplicate NPIs (e.g., from overlapping inserts), the second one is silently dropped. This is arguably fine for this dataset, but the sanity checks don't catch it. You could log a warning when `changes() === 0` after an insert, or at minimum note in the header comment that duplicates are intentionally skipped.

### 4. `db.ts` path assumes compiled directory structure
`db.ts:19` computes `dbPath` relative to `__dirname` with `path.join(__dirname, "..", "data", "doctors.db")`. This works when running from `dist/db.js` (compiled) but would break if someone runs the source directly with `tsx src/db.ts`. Since `import-data.ts` and `verify-data.ts` both use `tsx`, this inconsistency could surprise a developer. A comment clarifying this is a runtime-only module (loaded from `dist/`) would help.

### 5. `verify-data.ts` checks print after PASS/FAIL verdict
In `verify-data.ts`, the `check()` helper calls the function, and the function logs details (like `Count: 85737`) *inside* the callback — but the PASS/FAIL is printed after the return. This means output interleaves: `[CHECK] Total row count > 80,000...   Count: 85737\nPASS`. It's cosmetically weird but functionally fine.

### 6. No `\r` stripping in `parseValues`
The data import spec says "Strip `\r` from all values." The parser handles `\r` when it appears as a `\` followed by `r` (a literal escape sequence in the dump), but it does *not* strip actual carriage return bytes (`\r`, 0x0D) that might appear in values if the dump has Windows line endings. If the dump uses `\r\n` line endings, lines read by `readFileSync` will have `\r` at the end, which could end up in field values. This is likely fine since the regex matches by line and the parser operates on the VALUES clause, but it's a gap between spec and implementation.

### 7. Dockerfile uses `node:22-slim` instead of `node:20-slim`
The architecture doc specifies `node:20-slim`. The Dockerfile uses `node:22-slim`. Minor, but if this is a team project, the deviation from the spec should be intentional and documented.

## Suggestions (non-blocking)

- Consider adding a `--dry-run` flag that parses without writing, useful for debugging dump changes.
- The `totalInserted` count increments by `tuples.length`, which counts *parsed* tuples — not actually inserted rows (since `INSERT OR IGNORE` may skip some). Rename it or track both counts.
- The progress output using `\r` overwrites in place, which is nice, but won't look right in non-TTY contexts (like Docker build logs). Consider checking `process.stdout.isTTY`.

## Verdict

The implementation is solid and production-ready for its scope. The parser is the hardest part and it's well done. The main risks are the fragile regex for statement splitting (#2) and the misleading `TOTAL_COLUMNS` constant (#1). Neither is likely to cause issues with the current dump, but they'd bite on dump format changes.
