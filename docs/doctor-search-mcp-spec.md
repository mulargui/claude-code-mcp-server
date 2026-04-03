# Doctor Search MCP Server — Functional Spec

## Overview

An MCP server that exposes a single tool, `doctor-search`, allowing clients to search for doctors by last name, specialty, gender, and/or zip code.

## Tool

### `doctor-search`

Search for doctors matching the provided filters.

#### Input

All parameters are optional strings, but the following constraints apply:

- **At least one filter must be provided.** A request with no filters is rejected.
- **At least `lastname` or `speciality` must be included.** Requests that only specify `gender` and/or `zipcode` without `lastname` or `speciality` are rejected.
- **All input fields are validated before processing the search.** If any field fails validation, the request is rejected with a descriptive error before any search is performed.

| Parameter    | Type   | Description                          | Validation                                       |
|--------------|--------|--------------------------------------|--------------------------------------------------|
| `lastname`   | string | Filter by doctor's last name         | Non-empty, alphabetic characters only             |
| `speciality` | string | Filter by medical specialty          | Non-empty, must be a recognized specialty          |
| `gender`     | string | Filter by gender                     | Non-empty, valid values: `male`, `female`, `M`, `F` |
| `zipcode`    | string | Filter by zip code                   | Non-empty, valid US zip code format                |

When multiple filters are provided, they are combined with AND logic — only doctors matching **all** specified filters are returned.

#### Output

A list of doctor records. Each record contains:

| Field        | Type   | Description                          |
|--------------|--------|--------------------------------------|
| `lastname`   | string | Doctor's last name                   |
| `firstname`  | string | Doctor's first name                  |
| `speciality` | string | Medical specialty                    |
| `gender`     | string | Gender                               |
| `address`    | string | Street address                       |
| `city`       | string | City                                 |
| `zipcode`    | string | Zip code                             |
| `phone`      | string | Phone number                         |

#### Error Cases

| Condition                                                | Error Message                                                        |
|----------------------------------------------------------|----------------------------------------------------------------------|
| No filters provided                                      | "At least one filter is required."                                   |
| Filters provided but missing `lastname` and `speciality` | "At least `lastname` or `speciality` must be included as a filter."  |
| A field fails validation                                 | Descriptive error identifying the invalid field and reason            |

#### Examples

**Search by specialty:**
```json
{
  "speciality": "cardiology"
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
  "speciality": "cardiology",
  "zipcode": "abc"
}
```

**Invalid — unrecognized gender value (rejected):**
```json
{
  "speciality": "cardiology",
  "gender": "other"
}
```
