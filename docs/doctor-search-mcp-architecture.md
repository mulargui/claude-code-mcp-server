# Doctor Search MCP Server — Architecture

## Context

We're building an MCP server (dual transport: stdio + Streamable HTTP) in TypeScript that exposes two tools: `doctor-search` and `specialty-list`. The data comes from a MySQL dump (`data/healthylinkxdump.sql`) containing ~21MB of NPI provider data. The server is read-only. Both transports are always active — stdio for subprocess-based MCP clients, HTTP for network-accessible deployments.

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
  phone          TEXT           -- 10-digit US phone, no formatting
);

CREATE INDEX idx_last_name      ON doctors(last_name);
CREATE INDEX idx_classification ON doctors(classification);
CREATE INDEX idx_specialization ON doctors(specialization);
CREATE INDEX idx_gender         ON doctors(gender);
CREATE INDEX idx_zipcode        ON doctors(zipcode);
```

The `taxonomy` and `specializations` tables are **not needed** — specialty validation no longer checks against known values (prefix matching with zero results is the feedback mechanism).

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
├── Dockerfile
├── .dockerignore
├── package.json
├── tsconfig.json
├── data/
│   ├── healthylinkxdump.sql   # source MySQL dump (checked in)
│   ├── doctors.db             # generated SQLite DB (gitignored)
│   └── import-data.ts         # MySQL dump → SQLite import script
├── src/
│   ├── index.ts               # entry point: starts stdio + HTTP transports
│   ├── server.ts              # MCP server factory, tool registration
│   ├── http.ts                # HTTP server, StreamableHTTP transport, session management
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
- Creates an MCP server instance via `createServer()` and connects `StdioServerTransport`
- Starts the HTTP server via `http.ts` (listens on `PORT`, default `3000`)
- Handles graceful shutdown: closes HTTP server, stdio transport, and DB

### `src/server.ts` — MCP Server Factory
- Exports `createServer()` — returns a new `Server` instance each time, so stdio and each HTTP session get independent instances sharing the same tool registration logic
- Registers two tools: `doctor-search` (with its JSON Schema input definition) and `specialty-list` (no parameters)
- On `doctor-search` call: validates input via `validate.ts`, then queries via `search.ts`
- On `specialty-list` call: queries via `search.ts` to retrieve distinct specialties
- Returns results as structured content, or error messages for invalid input
- Returns `"Internal error: please try again later."` for unknown tool names or unexpected failures

### `src/http.ts` — HTTP Transport
- Creates a Node.js HTTP server using `node:http` (no Express dependency)
- Handles `POST /mcp` — creates a `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`, connects a new `Server` instance via `createServer()`, delegates the request
- Handles `GET /mcp` — SSE stream for server-initiated messages (uses existing session's transport)
- Handles `DELETE /mcp` — session termination and cleanup
- Session management: each HTTP client gets an isolated server+transport pair, all sharing the same read-only DB
- Sessions are identified by the `Mcp-Session-Id` header (managed by the SDK)

### `src/db.ts` — Database Access
- Exports a function to open the SQLite DB in read-only mode using `better-sqlite3`
- Exports a function to close the DB
- Provides the DB instance to other modules

### `src/search.ts` — Query Builder
- **`searchDoctors`**: Builds parameterized SQL queries based on validated filters
  - The `lastname` filter uses prefix matching: `lastname LIKE ? || '%' COLLATE NOCASE`
  - The `specialty` filter uses prefix matching against both columns: `(classification LIKE ? || '%' COLLATE NOCASE OR specialization LIKE ? || '%' COLLATE NOCASE)`
  - All other filters are direct equality checks (case-insensitive via `COLLATE NOCASE`)
  - Runs a `SELECT COUNT(*)` query (same filters, no LIMIT) to get the exact total match count
  - Appends `LIMIT 50` to the results query
  - Maps the output `specialty` field: when both `classification` and `specialization` match the query prefix, returns the longer string; when only one matches, returns that one
  - Returns `{ total_count, doctors }` — total count plus the capped result list
- **`listSpecialties`**: Queries `SELECT DISTINCT classification FROM doctors WHERE classification IS NOT NULL ORDER BY classification`
  - Returns `{ specialties }` — an alphabetically sorted array of distinct specialty names

### `src/validate.ts` — Input Validation
- Validates the filter combination rules (at least one filter; must include `lastname` or `specialty`)
- Validates individual fields:
  - `lastname`: alphabetic + hyphens only, minimum 3 characters (prefix match, so single-char queries are too broad)
  - `specialty`: minimum 3 characters, alphabetic + spaces + hyphens only (no DB validation — unmatched prefixes simply return zero results)
  - `gender`: must be one of `male`, `female`, `M`, `F` (normalized to `M`/`F` for querying)
  - `zipcode`: must be 5 digits

### `src/types.ts` — Types
- `DoctorSearchInput`: the tool input shape
- `DoctorRecord`: the output record shape (includes `npi` as a unique identifier)
- `SpecialtyListResult`: the `specialty-list` output shape (`{ specialties: string[] }`)
- `ValidationError`: error type

### `data/import-data.ts` — Data Import
- Reads the MySQL dump file
- Parses `INSERT INTO` statements for `npidata2` table using regex
- Strips `\r` from values (present in the dump's Specialization column)
- Creates the SQLite DB with the schema above
- Inserts records in batches within a transaction
- Runs a **post-import sanity check** before finishing:
  - Verifies total row count is within an expected range (fails if zero or suspiciously low)
  - Spot-checks a few known NPI records exist and have non-empty `last_name`, `classification`
  - Logs the final row count for visibility
  - Exits with a non-zero code if any check fails, so the Docker build breaks loudly rather than shipping an empty or corrupt DB

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK (provides both `StdioServerTransport` and `StreamableHTTPServerTransport`)
- `better-sqlite3` — SQLite driver (synchronous API)
- `typescript`, `@types/better-sqlite3` — dev dependencies
- `tsx` — for running TypeScript scripts directly
- `node:http` — built-in Node.js module for the HTTP server (no additional dependency)

## Data Flow

```
doctor-search call → server.ts
  → validate.ts (reject bad input early)
  → search.ts → searchDoctors (build & run SQL query)
  → return results to client

specialty-list call → server.ts
  → search.ts → listSpecialties (query distinct classifications)
  → return results to client
```

## Verification

1. **Build**: Run `docker build -t doctor-search-mcp .` — verify the image builds successfully (this compiles TypeScript, imports the data, and generates `data/doctors.db`)
2. **Manual test**: Run `docker run -i --rm doctor-search-mcp` and send MCP tool calls via stdin (or connect from Claude Code using the MCP client configuration above)
3. **Smoke queries**:
   - `doctor-search` with `{"specialty": "Internal Medicine"}` → returns doctors (capped at 50)
   - `doctor-search` with `{"lastname": "Smith"}` → returns doctors
   - `doctor-search` with `{"gender": "female"}` → rejected (missing lastname/specialty)
   - `doctor-search` with `{"specialty": "cardiology", "zipcode": "abc"}` → rejected (invalid zip)
   - `specialty-list` with `{}` → returns sorted list of distinct specialties

## Container

The server runs inside a Docker container with all dependencies and data baked in.

- **Multi-stage Dockerfile** based on `node:22-slim` — build stage compiles TypeScript and runs the data import; runtime stage copies only the compiled JS, `node_modules`, and `data/doctors.db`
- Data import happens at **build time**, so the SQLite DB is baked into the image
- `EXPOSE $PORT` — exposes the HTTP transport port
- Build: `docker build -t doctor-search-mcp .`
- Run (stdio only): `docker run -i --rm doctor-search-mcp` (`-i` keeps stdin open; HTTP server runs inside but port is not mapped)
- Run (HTTP): `docker run -p $PORT:$PORT --rm doctor-search-mcp`
- Run (both externally accessible): `docker run -i -p $PORT:$PORT --rm doctor-search-mcp`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | HTTP transport listen port |

### MCP Client Configuration

**Stdio (subprocess):**
```json
{
  "mcpServers": {
    "doctor-search": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "doctor-search-mcp"]
    }
  }
}
```

**HTTP (network):**
```json
{
  "mcpServers": {
    "doctor-search": {
      "url": "http://localhost:${PORT}/mcp"
    }
  }
}
```
