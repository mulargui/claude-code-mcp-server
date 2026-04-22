# Doctor Search MCP Server — Interface Definition

## Server Info

```json
{
  "name": "doctor-search",
  "version": "1.1.0"
}
```

## Tool: `doctor-search`

**Description** (returned in `tools/list` for LLM consumption):

```
Search a US doctor directory by last name, specialty, gender, and/or zip code.
Returns matching doctor profiles including NPI, name, specialty, address, and phone.
At least lastname or specialty must be provided. Results are capped at 50.
Use prefix matching: e.g. lastname "Smi" matches "Smith", specialty "Cardio" matches "Cardiology".
```

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "lastname": {
      "type": "string",
      "description": "Filter by doctor's last name (prefix match, minimum 3 characters). Alphabetic characters and hyphens only."
    },
    "specialty": {
      "type": "string",
      "description": "Filter by medical specialty (prefix match, minimum 3 characters). Matches against both classification and specialization. Alphabetic characters, spaces, and hyphens only."
    },
    "gender": {
      "type": "string",
      "enum": ["male", "female", "M", "F"],
      "description": "Filter by gender. Normalized to M/F internally."
    },
    "zipcode": {
      "type": "string",
      "pattern": "^[0-9]{5}$",
      "description": "Filter by 5-digit US zip code (exact match)."
    }
  },
  "additionalProperties": false
}
```

**Constraints not expressible in JSON Schema (enforced by server validation):**
- At least one parameter must be provided.
- At least `lastname` or `specialty` must be included. Requests with only `gender` and/or `zipcode` are rejected.

### Output

On success, the tool returns a text content block containing a JSON object:

```json
{
  "total_count": 142,
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

| Field         | Type   | Description |
|---------------|--------|-------------|
| `total_count` | number | Total matching doctors (may exceed 50) |
| `doctors`     | array  | Up to 50 doctor records |

Each doctor record:

| Field       | Type   | Description |
|-------------|--------|-------------|
| `npi`       | string | National Provider Identifier |
| `lastname`  | string | Last name |
| `firstname` | string | First name |
| `specialty` | string | Medical specialty (longer of classification/specialization when both match the query prefix) |
| `gender`    | string | `"M"` or `"F"` |
| `address`   | string | Street address |
| `city`      | string | City |
| `zipcode`   | string | 5-digit zip code |
| `phone`     | string | 10-digit US phone number (e.g. `"3105551234"`) |

### Errors

Validation errors are returned with `isError: true` and a text content block containing a descriptive message.

| Condition | Error Message |
|-----------|---------------|
| No filters provided | `"At least one filter is required."` |
| Missing `lastname` and `specialty` | `"At least 'lastname' or 'specialty' must be included as a filter."` |
| Invalid `lastname` | `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."` |
| Invalid `specialty` | `"Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."` |
| Invalid `gender` | `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."` |
| Invalid `zipcode` | `"Invalid zipcode: must be exactly 5 digits."` |

Internal errors (e.g., database unavailable or query failure) are returned with `isError: true` and the message `"Internal error: please try again later."`.

## Tool: `specialty-list`

**Description** (returned in `tools/list` for LLM consumption):

```
List all available medical specialties in the doctor directory.
Returns an alphabetically sorted list of distinct specialty names.
Use this to discover valid specialty values before searching with doctor-search.
```

### Input Schema

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

No parameters — the tool always returns the full list.

### Output

On success, the tool returns a text content block containing a JSON object:

```json
{
  "specialties": [
    "Allergy & Immunology",
    "Anesthesiology",
    "Cardiology",
    "..."
  ]
}
```

| Field          | Type     | Description |
|----------------|----------|-------------|
| `specialties`  | string[] | Alphabetically sorted list of distinct specialty names (from the `classification` column) |

### Errors

This tool takes no input, so there are no validation errors. Internal errors (e.g., database unavailable or query failure) are returned with `isError: true` and the message `"Internal error: please try again later."`.

## MCP Protocol Details

- **Transport:** stdio
- **Capabilities:** tools only (no resources, no prompts)
- **Tool listing:** Two tools (`doctor-search`, `specialty-list`) returned via `tools/list`
- **Tool invocation:** Via `tools/call` with `name: "doctor-search"` or `name: "specialty-list"` and `arguments` matching the respective input schema above
- **Response format:** `CallToolResult` with `content: [{ type: "text", text: "<JSON string>" }]` on success, or `content: [{ type: "text", text: "<error message>" }]` with `isError: true` on failure
