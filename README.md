# Doctor Search MCP Server

An MCP server that lets LLMs search a directory of ~85,000 US doctors by last name, specialty, gender, and zip code.

## What is this?

This project exposes two tools — `doctor-search` and `specialty-list` — via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Any MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.) can discover and invoke them to look up doctor profiles or browse available specialties.

The data comes from a MySQL dump of NPI (National Provider Identifier) records, imported into a SQLite database at build time. The server runs inside Docker and communicates over stdio.

## Quick Start

**Prerequisites:** Docker

```bash
# Build the image (compiles TypeScript, runs tests, imports data)
docker build -t doctor-search-mcp .

# Run the server
docker run -i --rm doctor-search-mcp
```

## MCP Client Configuration

Add this to your MCP client's configuration to connect:

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

## Tools

### `doctor-search`

Search for doctors matching the provided filters. At least one filter is required, and at least `lastname` or `specialty` must be included.

### Parameters

| Parameter   | Type   | Match   | Rules |
|-------------|--------|---------|-------|
| `lastname`  | string | Prefix  | 3+ chars, alphabetic and hyphens only |
| `specialty` | string | Prefix  | 3+ chars, alphabetic, spaces, and hyphens only |
| `gender`    | string | Exact   | `male`, `female`, `M`, or `F` |
| `zipcode`   | string | Exact   | Exactly 5 digits |

Multiple filters combine with AND logic. Results are capped at 50 records.

### Examples

**Search by specialty:**
```json
{ "specialty": "Cardiology" }
```

**Search by last name and zip code:**
```json
{ "lastname": "Smith", "zipcode": "90210" }
```

**Response:**
```json
{
  "total_count": 3,
  "doctors": [
    {
      "npi": "1234567890",
      "lastname": "Smith",
      "firstname": "John",
      "specialty": "Internal Medicine",
      "gender": "M",
      "address": "123 Main St",
      "city": "Los Angeles",
      "zipcode": "90210",
      "phone": "3105551234"
    }
  ]
}
```

`total_count` reflects the true number of matches, even when results are capped at 50.

### `specialty-list`

Returns all available medical specialties, sorted alphabetically. No parameters required. Use this to discover valid specialty values before searching with `doctor-search`.

```json
{
  "specialties": ["Allergy & Immunology", "Anesthesiology", "Cardiology", "..."]
}
```

## Limitations

- No first-name search
- No state-level geographic filter
- No pagination — results capped at 50 records with no way to fetch beyond that
- Specialty matching is prefix-based only (no fuzzy or keyword search)

## Documentation

Design documents live in `docs/`. See [AGENTS.md](AGENTS.md) for a full index.
