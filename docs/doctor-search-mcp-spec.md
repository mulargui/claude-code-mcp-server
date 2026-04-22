# Doctor Search MCP Server — Functional Spec

## Overview

An MCP server that exposes two tools: `doctor-search` for searching doctors by last name, specialty, gender, and/or zip code, and `specialty-list` for retrieving the list of available medical specialties.

### Why?

Doctor-search has been a component available to multiple apps in the past using an API. With the advent of LLMs and its use in chat applications, chat bots and agents, there are better ways to integrate this component. 

At this time the MCP protocol (https://modelcontextprotocol.io/) is the gold standard to integrate third party tools into an LLM. The LLM will understand the services provided by the component, how to invoke them and interpret results.

There is a growing interest in the A2A protocol (https://a2a-protocol.org/), but the decision has been to start with the MCP protocol, which is well-known and broadly adopted, and postpone to implement the A2A protocol to the future.

## Tools

### `doctor-search`

Search for doctors matching the provided filters.

#### Input

All parameters are optional strings, but the following constraints apply:

- **At least one filter must be provided.** A request with no filters is rejected.
- **At least `lastname` or `specialty` must be included.** Requests that only specify `gender` and/or `zipcode` without `lastname` or `specialty` are rejected.
- **All input fields are validated before processing the search.** If any field fails validation, the request is rejected with a descriptive error before any search is performed.

| Parameter    | Type   | Description                          | Validation                                       |
|--------------|--------|--------------------------------------|--------------------------------------------------|
| `lastname`   | string | Filter by doctor's last name (prefix match) | Non-empty, alphabetic characters only             |
| `specialty` | string | Filter by medical specialty (prefix match) | Non-empty, minimum 3 characters                   |
| `gender`     | string | Filter by gender                     | Non-empty, valid values: `male`, `female`, `M`, `F` |
| `zipcode`    | string | Filter by zip code                   | Non-empty, valid US zip code format                |

The `lastname` filter uses **prefix matching** — searching for `"Smi"` will match `"Smith"`, `"Smithson"`, etc. The `specialty` filter also uses **prefix matching** and searches against both the doctor's classification and specialization — searching for `"Cardio"` will match doctors with classification `"Cardiology"` or specialization `"Cardiovascular Disease"`. All other filters use exact matching. When multiple filters are provided, they are combined with AND logic — only doctors matching **all** specified filters are returned.

Results are capped at **50 records**. If more matches exist, only the first 50 are returned.

#### Output

The response contains:

| Field          | Type   | Description                          |
|----------------|--------|--------------------------------------|
| `total_count`  | number | Total number of matching doctors (may exceed 50) |
| `doctors`      | array  | List of doctor records (max 50)      |

Each doctor record contains:

| Field        | Type   | Description                          |
|--------------|--------|--------------------------------------|
| `npi`        | string | National Provider Identifier (unique key) |
| `lastname`   | string | Doctor's last name                   |
| `firstname`  | string | Doctor's first name                  |
| `specialty` | string | Medical specialty (the longer of classification/specialization when both match the query) |
| `gender`     | string | Gender                               |
| `address`    | string | Street address                       |
| `city`       | string | City                                 |
| `zipcode`    | string | Zip code                             |
| `phone`      | string | 10-digit US phone number (e.g. `"3105551234"`) |

#### Error Cases

| Condition                                                | Error Message                                                        |
|----------------------------------------------------------|----------------------------------------------------------------------|
| No filters provided                                      | "At least one filter is required."                                   |
| Filters provided but missing `lastname` and `specialty` | "At least `lastname` or `specialty` must be included as a filter."  |
| A field fails validation (e.g. fewer than 3 characters for lastname/specialty) | Descriptive error identifying the invalid field and reason            |

#### Examples

**Search by specialty:**
```json
{
  "specialty": "cardiology"
}
```

**Search by last name and zip code:**
```json
{
  "lastname": "Smith",
  "zipcode": "90210"
}
```

**Invalid — only gender provided (rejected):**
```json
{
  "gender": "female"
}
```

**Invalid — bad zip code format (rejected):**
```json
{
  "specialty": "cardiology",
  "zipcode": "abc"
}
```

**Invalid — unrecognized gender value (rejected):**
```json
{
  "specialty": "cardiology",
  "gender": "other"
}
```

### `specialty-list`

Returns the full list of distinct medical specialties available in the database. Specialties are drawn from the `classification` column.

#### Input

None — this tool takes no parameters.

#### Output

| Field          | Type     | Description                                          |
|----------------|----------|------------------------------------------------------|
| `specialties`  | string[] | Alphabetically sorted list of distinct specialty names |

#### Error Cases

| Condition          | Error Message                              |
|--------------------|--------------------------------------------|
| Internal failure   | "Internal error: please try again later."  |

#### Example

**Response:**
```json
{
  "specialties": [
    "Allergy & Immunology",
    "Anesthesiology",
    "Cardiology",
    "Dermatology",
    "..."
  ]
}
```
