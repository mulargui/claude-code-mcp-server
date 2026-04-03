# Doctor Search MCP Server — Functional Spec

## Overview

An MCP server that exposes a single tool, `doctor-search`, allowing clients to search for doctors by last name, specialty, gender, and/or zip code.

## Tool

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
| `phone`      | string | Phone number                         |

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
