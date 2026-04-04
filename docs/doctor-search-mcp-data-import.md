# Doctor Search MCP Server — Data Import & Verification

## Context

The project has infrastructure stubs in place. We need to implement the data import script (`data/import-data.ts`) that parses the MySQL dump (`data/healthylinkxdump.sql`, ~85k records, 21 INSERT statements) and populates a SQLite database. We also need a standalone verify script to confirm the import works, and minimal wiring in `src/db.ts` so the server can open the DB.

## Files to Modify

1. **`data/import-data.ts`** — Full implementation (currently a stub creating empty DB)
2. **`data/verify-data.ts`** — New file: standalone script to query the DB and print results
3. **`src/db.ts`** — Implement `openDb`/`closeDb` with real `better-sqlite3` logic
4. **`Dockerfile`** — Add `RUN npm run verify-data` after the import step
5. **`package.json`** — Add `verify-data` script

## Implementation

All files will include a descriptive header comment block at the top explaining the file's purpose, inputs, outputs, and usage so they can be quickly understood when scanning the codebase.

### 1. `data/import-data.ts` — Parse MySQL dump → SQLite

- Read `healthylinkxdump.sql` as a string
- Find all `INSERT INTO \`npidata2\` VALUES ...;` statements (21 of them, each with many records)
- Parse the value tuples using a character-by-character state machine to correctly handle:
  - Escaped single quotes (`\'` → `'`, e.g. `D'ANGELO`, `Nurse's Aide`)
  - Commas inside quoted strings
  - `\r` literal strings in the Specialization column
- Column indices (0-based) to extract:
  - 0=NPI, 1=last_name, 2=first_name, 8=address(Full_Street), 9=city, 13=short_postal_code, 14=phone, 15=gender, 17=classification, 18=specialization
- Strip `\r` from all values
- Create SQLite DB with schema (table + indexes) per architecture doc
- Insert records in batches within a transaction for performance
- **Post-import sanity checks:**
  - Row count is in range 80,000–90,000 (expect ~85,737)
  - Spot-check 3 known NPIs exist with correct data:
    - `1003000183` → CYPHERS, classification "Massage Therapist"
    - `1003002379` → SHRESTHA, classification "Internal Medicine"
    - `1003001116` → SCOTT, gender "F"
  - Exit with non-zero code on failure
- Log row count on success

### 2. `src/db.ts` — Real implementation

- `openDb()`: opens `data/doctors.db` in read-only mode via `better-sqlite3`, stores as module-level singleton
- `closeDb()`: closes the singleton
- `getDb()`: returns the open DB instance (for use by search.ts and verify script)

### 3. `data/verify-data.ts` — Standalone verification script

- Opens `data/doctors.db` directly (doesn't go through src/db.ts to stay independent)
- Runs a few queries and prints results:
  - Total row count
  - Search by last name prefix "SMI" (LIKE 'SMI%') — shows first 5 results
  - Search by classification prefix "Internal" — shows first 5 results
  - Search by gender "F" + zipcode "98223" — shows count
- Reports pass/fail for each check

### 4. `package.json` — Add verify-data script

- Add `"verify-data": "tsx data/verify-data.ts"` to scripts

## Verification

Everything runs inside Docker. Build the image to trigger import + verify:

```bash
docker build -t doctor-search-mcp .
```

The Dockerfile already runs `npm run import-data` during the build stage. We'll add `npm run verify-data` right after it in the Dockerfile so the build fails if the data is bad.

Alternatively, to test locally without Docker (if node_modules are installed):
```bash
npm run import-data
npm run verify-data
```
