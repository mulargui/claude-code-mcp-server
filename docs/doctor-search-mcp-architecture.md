# Doctor Search MCP Server — Architecture

## Context

We're building a local MCP server (stdio transport) in TypeScript that exposes a single `doctor-search` tool. The data comes from a MySQL dump (`data/healthylinkxdump.sql`) containing ~21MB of NPI provider data. The server is read-only and local-only.

## Datastore

**SQLite** via `better-sqlite3` (synchronous, fast reads, zero-config).

- A **build-time script** (`data/import-data.ts`) parses the MySQL dump and populates a SQLite database at `data/doctors.db`.
- The MCP server opens this SQLite DB in **read-only mode** at startup.
- The SQLite DB is gitignored; the MySQL dump is the source of truth. Running the import script regenerates it.

### Schema

We only import `npidata2` and `taxonomy` tables. The `speciality` table maps taxonomy codes to classifications — but `npidata2` already has `Classification` and `Specialization` inline, so we can skip the `speciality` table too.

**`doctors` table** (derived from `npidata2`):

```sql
CREATE TABLE doctors (
  npi            TEXT PRIMARY KEY,
  last_name      TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  classification TEXT,          -- e.g. "Internal Medicine"
  specialization TEXT,          -- e.g. "Cardiovascular Disease"
  gender         TEXT,          -- "M" or "F"
  address        TEXT,
  city           TEXT,
  zipcode        TEXT,          -- 5-digit
  phone          TEXT
);

CREATE INDEX idx_last_name      ON doctors(last_name);
CREATE INDEX idx_classification ON doctors(classification);
CREATE INDEX idx_specialization ON doctors(specialization);
CREATE INDEX idx_gender         ON doctors(gender);
CREATE INDEX idx_zipcode        ON doctors(zipcode);
```

**`taxonomy` table** (for validating specialty input):

```sql
CREATE TABLE taxonomy (
  classification TEXT PRIMARY KEY
);
```

We also extract distinct non-empty `Specialization` values from `npidata2` into a `specializations` table for validation:

```sql
CREATE TABLE specializations (
  specialization TEXT PRIMARY KEY
);
```

### Column Mapping (MySQL → SQLite)

| MySQL `npidata2` column                        | SQLite `doctors` column |
|------------------------------------------------|-------------------------|
| `NPI`                                          | `npi`                   |
| `Provider_Last_Name_Legal_Name`                | `last_name`             |
| `Provider_First_Name`                          | `first_name`            |
| `Classification`                               | `classification`        |
| `Specialization`                               | `specialization`        |
| `Provider_Gender_Code`                         | `gender`                |
| `Provider_Full_Street`                         | `address`               |
| `Provider_Business_Practice_Location_Address_City_Name` | `city`         |
| `Provider_Short_Postal_Code`                   | `zipcode`               |
| `Provider_Business_Practice_Location_Address_Telephone_Number` | `phone` |

## Project Structure

```
/
├── package.json
├── tsconfig.json
├── data/
│   ├── healthylinkxdump.sql   # source MySQL dump (checked in)
│   ├── doctors.db             # generated SQLite DB (gitignored)
│   └── import-data.ts         # MySQL dump → SQLite import script
├── src/
│   ├── index.ts               # entry point: creates & starts the MCP server
│   ├── server.ts              # MCP server setup, tool registration
│   ├── db.ts                  # SQLite connection (read-only singleton)
│   ├── search.ts              # query builder & executor for doctor-search
│   ├── validate.ts            # input validation logic
│   └── types.ts               # shared TypeScript types
└── docs/
    ├── doctor-search-mcp-spec.md
    ├── spec-conversation.md
    └── architecture.md
```

## Module Responsibilities

### `src/index.ts` — Entry Point
- Opens the SQLite DB via `db.ts`
- Creates the MCP server via `server.ts`
- Connects stdio transport
- Handles graceful shutdown (close DB)

### `src/server.ts` — MCP Server Setup
- Uses `@modelcontextprotocol/sdk` to create a `Server`
- Registers the `doctor-search` tool with its JSON Schema input definition
- On tool call: validates input via `validate.ts`, then queries via `search.ts`
- Returns results as structured content, or error messages for invalid input

### `src/db.ts` — Database Access
- Exports a function to open the SQLite DB in read-only mode using `better-sqlite3`
- Exports a function to close the DB
- Provides the DB instance to other modules

### `src/search.ts` — Query Builder
- Builds parameterized SQL queries based on validated filters
- The `speciality` filter queries with: `(classification = ? OR specialization = ?)`
- All other filters are direct equality checks (case-insensitive via `COLLATE NOCASE`)
- Returns typed doctor records

### `src/validate.ts` — Input Validation
- Validates the filter combination rules (at least one filter; must include `lastname` or `speciality`)
- Validates individual fields:
  - `lastname`: alphabetic + hyphens only (data has hyphenated names like "JOHNSON-FENTER")
  - `speciality`: must exist in `taxonomy.classification` or `specializations.specialization`
  - `gender`: must be one of `male`, `female`, `M`, `F` (normalized to `M`/`F` for querying)
  - `zipcode`: must be 5 digits

### `src/types.ts` — Types
- `DoctorSearchInput`: the tool input shape
- `DoctorRecord`: the output record shape
- `ValidationError`: error type

### `data/import-data.ts` — Data Import
- Reads the MySQL dump file
- Parses `INSERT INTO` statements for `npidata2` and `taxonomy` tables using regex
- Strips `\r` from values (present in the dump's Specialization column)
- Creates the SQLite DB with the schema above
- Inserts records in batches within a transaction
- Extracts distinct specializations from npidata2 into the `specializations` table

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `better-sqlite3` — SQLite driver (synchronous API, ideal for MCP stdio)
- `typescript`, `@types/better-sqlite3` — dev dependencies
- `tsx` — for running TypeScript scripts directly

## Data Flow

```
Tool call → server.ts
  → validate.ts (reject bad input early)
  → search.ts (build & run SQL query)
  → return results to client
```

## Verification

1. **Import**: Run `npx tsx data/import-data.ts` — verify `data/doctors.db` is created and queryable
2. **Manual test**: Run the server with `npx tsx src/index.ts` and send MCP tool calls via stdin (or connect from Claude Code)
3. **Smoke queries**:
   - `{"speciality": "Internal Medicine"}` → returns doctors
   - `{"lastname": "Smith"}` → returns doctors
   - `{"gender": "female"}` → rejected (missing lastname/speciality)
   - `{"speciality": "cardiology", "zipcode": "abc"}` → rejected (invalid zip)
