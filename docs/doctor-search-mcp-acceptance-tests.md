# Doctor Search MCP Server — Acceptance Tests

## Overview

Acceptance tests for the `doctor-search` MCP server interface. These tests validate the server's behavior as observed by an MCP client over stdio transport. They cover the full surface: MCP protocol compliance, input validation, search logic, output format, and error handling.

Tests use the **Given-When-Then** style. Each test assumes the server is running with a populated SQLite database containing known test data unless otherwise stated.

---

## Test Data Assumptions

Tests reference a controlled dataset seeded into the SQLite database before the test suite runs. The dataset includes:

| NPI          | last_name   | first_name | classification           | specialization              | gender | address         | city          | zipcode | phone        |
|--------------|-------------|------------|--------------------------|-----------------------------|--------|-----------------|---------------|---------|--------------|
| `1000000001` | `Smith`     | `John`     | `Internal Medicine`      | `Cardiovascular Disease`    | `M`    | `100 Main St`   | `Los Angeles` | `90210` | `3105551001` |
| `1000000002` | `Smith`     | `Jane`     | `Internal Medicine`      | (empty)                     | `F`    | `200 Oak Ave`   | `Los Angeles` | `90210` | `3105551002` |
| `1000000003` | `Smithson`  | `Robert`   | `Family Medicine`        | (empty)                     | `M`    | `300 Elm St`    | `Chicago`     | `60601` | `3125551003` |
| `1000000004` | `Johnson`   | `Emily`    | `Cardiology`             | `Interventional Cardiology` | `F`    | `400 Pine Rd`   | `New York`    | `10001` | `2125551004` |
| `1000000005` | `Williams`  | `Michael`  | `Orthopedic Surgery`     | (empty)                     | `M`    | `500 Cedar Ln`  | `Houston`     | `77001` | `7135551005` |
| `1000000006` | `O-Brien`   | `Sarah`    | `Internal Medicine`      | `Geriatric Medicine`        | `F`    | `600 Birch Dr`  | `Portland`    | `97201` | `5035551006` |
| `1000000007` | `Garcia`    | `Carlos`   | `Psychiatry`             | `Child Psychiatry`          | `M`    | `700 Maple St`  | `Miami`       | `33101` | `3055551007` |
| 50+ additional records with `last_name = "Test"` and `classification = "Pediatrics"` | — to test the 50-record cap and `total_count` behavior |

---

## 1. MCP Protocol Compliance

### 1.1 Server initialization

**Given** the MCP server is started via stdio transport
**When** the client sends an `initialize` request
**Then** the server responds with `name: "doctor-search"` and `version: "1.0.0"`
**And** the capabilities include `tools` but not `resources` or `prompts`

### 1.2 Tool listing

**Given** the server is initialized
**When** the client sends a `tools/list` request
**Then** the response contains exactly one tool named `doctor-search`
**And** the tool has a `description` string that mentions prefix matching and the 50-result cap
**And** the tool has an `inputSchema` with properties `lastname`, `specialty`, `gender`, `zipcode`
**And** the `inputSchema` has `additionalProperties: false`

### 1.3 Tool call with valid input returns success format

**Given** the server is initialized
**When** the client sends a `tools/call` request with `name: "doctor-search"` and `arguments: { "lastname": "Smith" }`
**Then** the response is a `CallToolResult`
**And** `isError` is absent or `false`
**And** `content` is an array with a single element of `type: "text"`
**And** the `text` field contains a valid JSON string with `total_count` (number) and `doctors` (array)

### 1.4 Tool call with invalid input returns error format

**Given** the server is initialized
**When** the client sends a `tools/call` request with `name: "doctor-search"` and `arguments: {}`
**Then** the response is a `CallToolResult` with `isError: true`
**And** `content` is an array with a single element of `type: "text"`
**And** the `text` field contains the error message string

### 1.5 Unknown tool name

**Given** the server is initialized
**When** the client sends a `tools/call` request with `name: "unknown-tool"`
**Then** the server returns an MCP protocol error (method not found or tool not found)

---

## 2. Input Validation — Filter Combination Rules

### 2.1 No filters provided

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: {}`
**Then** the response has `isError: true`
**And** the message is `"At least one filter is required."`

### 2.2 Only gender provided

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "gender": "male" }`
**Then** the response has `isError: true`
**And** the message is `"At least 'lastname' or 'specialty' must be included as a filter."`

### 2.3 Only zipcode provided

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "zipcode": "90210" }`
**Then** the response has `isError: true`
**And** the message is `"At least 'lastname' or 'specialty' must be included as a filter."`

### 2.4 Only gender and zipcode provided

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "gender": "female", "zipcode": "90210" }`
**Then** the response has `isError: true`
**And** the message is `"At least 'lastname' or 'specialty' must be included as a filter."`

### 2.5 Lastname alone is sufficient

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** the response has `isError` absent or `false`
**And** the result contains matching doctors

### 2.6 Specialty alone is sufficient

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Internal Medicine" }`
**Then** the response has `isError` absent or `false`
**And** the result contains matching doctors

### 2.7 All four filters provided

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "specialty": "Internal", "gender": "male", "zipcode": "90210" }`
**Then** the response has `isError` absent or `false`

### 2.8 Lastname with gender is valid

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "female" }`
**Then** the response has `isError` absent or `false`

### 2.9 Specialty with zipcode is valid

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Cardio", "zipcode": "10001" }`
**Then** the response has `isError` absent or `false`

### 2.10 Lastname with zipcode is valid

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "90210" }`
**Then** the response has `isError` absent or `false`

### 2.11 Specialty with gender is valid

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Pediatrics", "gender": "M" }`
**Then** the response has `isError` absent or `false`

---

## 3. Input Validation — Individual Field Rules

### 3.1 Lastname — valid alphabetic

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** the response is successful

### 3.2 Lastname — valid with hyphen

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "O-Brien" }`
**Then** the response is successful

### 3.3 Lastname — too short (1 character)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "S" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 3.4 Lastname — too short (2 characters)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Sm" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 3.5 Lastname — exactly 3 characters (boundary)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smi" }`
**Then** the response is successful

### 3.6 Lastname — contains digits

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith2" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 3.7 Lastname — contains special characters

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith!" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 3.8 Lastname — contains spaces

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "De La Cruz" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 3.9 Lastname — empty string

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 3.10 Specialty — valid value

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Cardiology" }`
**Then** the response is successful

### 3.11 Specialty — valid with spaces and hyphens

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Internal Medicine" }`
**Then** the response is successful

### 3.12 Specialty — too short (1 character)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "C" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."`

### 3.13 Specialty — too short (2 characters)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Ca" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."`

### 3.14 Specialty — exactly 3 characters (boundary)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Car" }`
**Then** the response is successful

### 3.15 Specialty — contains digits

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Card1ology" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."`

### 3.16 Specialty — contains special characters

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Card@ology" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."`

### 3.17 Specialty — empty string

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."`

### 3.18 Gender — "male" accepted

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "male" }`
**Then** the response is successful

### 3.19 Gender — "female" accepted

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "female" }`
**Then** the response is successful

### 3.20 Gender — "M" accepted

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "M" }`
**Then** the response is successful

### 3.21 Gender — "F" accepted

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "F" }`
**Then** the response is successful

### 3.22 Gender — invalid value "other"

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "other" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."`

### 3.23 Gender — invalid value (arbitrary string)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "xyz" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."`

### 3.24 Gender — empty string

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."`

### 3.25 Zipcode — valid 5 digits

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "90210" }`
**Then** the response is successful

### 3.26 Zipcode — too few digits (4)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "9021" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid zipcode: must be exactly 5 digits."`

### 3.27 Zipcode — too many digits (6)

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "902100" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid zipcode: must be exactly 5 digits."`

### 3.28 Zipcode — ZIP+4 format rejected

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "90210-1234" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid zipcode: must be exactly 5 digits."`

### 3.29 Zipcode — alphabetic characters

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "abcde" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid zipcode: must be exactly 5 digits."`

### 3.30 Zipcode — mixed alphanumeric

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "90ab0" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid zipcode: must be exactly 5 digits."`

### 3.31 Zipcode — empty string

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid zipcode: must be exactly 5 digits."`

### 3.32 Zipcode — leading zeros preserved

**Given** the server is initialized and the test data contains a doctor with `zipcode: "01234"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "01234" }`
**Then** the response is successful (zipcode is treated as string, not integer)

---

## 4. Input Validation — Multiple Invalid Fields

### 4.1 Multiple fields invalid simultaneously

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "S", "zipcode": "abc" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 4.2 Combination rule violated AND field invalid

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "gender": "xyz" }`
**Then** the response has `isError: true`
**And** the message is `"At least 'lastname' or 'specialty' must be included as a filter."` (combination rule checked before individual field validation)

### 4.3 Valid combination with one invalid field

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Cardiology", "zipcode": "abc" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid zipcode: must be exactly 5 digits."`

---

## 5. Search Logic — Prefix Matching

### 5.1 Lastname prefix match — partial name

**Given** test data contains `Smith` (NPI 1000000001) and `Smithson` (NPI 1000000003)
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smi" }`
**Then** the result contains doctors with last names `Smith` and `Smithson`
**And** the result does not contain `Johnson` or `Williams`

### 5.2 Lastname prefix match — full name

**Given** test data contains `Smith` (NPI 1000000001, 1000000002) and `Smithson` (NPI 1000000003)
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** the result contains all three doctors (`Smith`, `Smith`, `Smithson`)

### 5.3 Lastname prefix match — exact full name only

**Given** test data contains `Smith` and `Smithson`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smithson" }`
**Then** the result contains only `Smithson`

### 5.4 Specialty prefix match — matches classification

**Given** test data contains doctors with `classification = "Internal Medicine"`
**When** the client calls `doctor-search` with `arguments: { "specialty": "Internal" }`
**Then** the result contains those doctors

### 5.5 Specialty prefix match — matches specialization

**Given** test data contains a doctor with `specialization = "Cardiovascular Disease"` (NPI 1000000001)
**When** the client calls `doctor-search` with `arguments: { "specialty": "Cardiovascular" }`
**Then** the result contains that doctor

### 5.6 Specialty prefix match — matches both classification and specialization

**Given** test data contains a doctor with `classification = "Cardiology"` and `specialization = "Interventional Cardiology"` (NPI 1000000004)
**When** the client calls `doctor-search` with `arguments: { "specialty": "Cardio" }`
**Then** the result contains that doctor
**And** the result also contains NPI 1000000001 (whose `specialization = "Cardiovascular Disease"` also matches)

### 5.7 Specialty prefix — short prefix matches broadly

**Given** test data contains doctors with classifications starting with "Int" (`Internal Medicine`) and specializations starting with "Int" (`Interventional Cardiology`)
**When** the client calls `doctor-search` with `arguments: { "specialty": "Int" }`
**Then** the result contains doctors from both groups

---

## 6. Search Logic — Case Insensitivity

### 6.1 Lastname — lowercase input matches capitalized data

**Given** test data contains `Smith`
**When** the client calls `doctor-search` with `arguments: { "lastname": "smith" }`
**Then** the result contains `Smith`

### 6.2 Lastname — uppercase input matches capitalized data

**Given** test data contains `Smith`
**When** the client calls `doctor-search` with `arguments: { "lastname": "SMITH" }`
**Then** the result contains `Smith`

### 6.3 Lastname — mixed case input matches

**Given** test data contains `Smith`
**When** the client calls `doctor-search` with `arguments: { "lastname": "sMiTh" }`
**Then** the result contains `Smith`

### 6.4 Specialty — case insensitive prefix match

**Given** test data contains `classification = "Internal Medicine"`
**When** the client calls `doctor-search` with `arguments: { "specialty": "internal medicine" }`
**Then** the result contains those doctors

### 6.5 Gender — "male" normalized to match "M" in database

**Given** test data contains `gender = "M"` for NPI 1000000001
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "male" }`
**Then** the result contains NPI 1000000001 (male)
**And** the result does not contain NPI 1000000002 (female)

### 6.6 Gender — "female" normalized to match "F" in database

**Given** test data contains `gender = "F"` for NPI 1000000002
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "female" }`
**Then** the result contains NPI 1000000002 (female)
**And** the result does not contain NPI 1000000001 (male)

### 6.7 Gender — "M" matches directly

**Given** test data contains male and female Smiths
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "M" }`
**Then** the result contains only male Smith(s)

### 6.8 Gender — "F" matches directly

**Given** test data contains male and female Smiths
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "F" }`
**Then** the result contains only female Smith(s)

---

## 7. Search Logic — Exact Matching

### 7.1 Zipcode — exact match only

**Given** test data contains doctors in `90210` and `90211`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "90210" }`
**Then** the result contains only doctors in zipcode `90210`
**And** does not contain doctors in `90211`

### 7.2 Zipcode — no prefix matching

**Given** test data contains doctors in `90210`
**When** the client calls `doctor-search` with `arguments: { "specialty": "Internal", "zipcode": "9021" }`
**Then** the response has `isError: true` (zipcode must be exactly 5 digits)

### 7.3 Gender — exact match (not prefix)

**Given** test data contains male and female doctors
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "M" }`
**Then** the result contains only male doctors

---

## 8. Search Logic — AND Combination

### 8.1 Lastname AND gender — intersection

**Given** test data contains `Smith/M` (NPI 1000000001) and `Smith/F` (NPI 1000000002)
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "male" }`
**Then** the result contains only NPI 1000000001

### 8.2 Lastname AND zipcode — intersection

**Given** test data contains `Smith/90210` (NPI 1000000001, 1000000002) and `Smithson/60601` (NPI 1000000003)
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smi", "zipcode": "90210" }`
**Then** the result contains NPI 1000000001 and 1000000002
**And** does not contain NPI 1000000003

### 8.3 Specialty AND gender AND zipcode — triple intersection

**Given** test data contains relevant records
**When** the client calls `doctor-search` with `arguments: { "specialty": "Internal", "gender": "male", "zipcode": "90210" }`
**Then** the result contains only doctors matching ALL three criteria

### 8.4 All four filters — quadruple intersection

**Given** test data contains NPI 1000000001: Smith, Internal Medicine, M, 90210
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "specialty": "Internal", "gender": "male", "zipcode": "90210" }`
**Then** the result contains NPI 1000000001
**And** `total_count` is 1

### 8.5 Filters that produce an empty intersection

**Given** test data contains `Smith/M/90210` and `Smith/F/90210`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "male", "zipcode": "60601" }`
**Then** the result has `total_count: 0`
**And** `doctors` is an empty array

---

## 9. Result Cap and Total Count

### 9.1 Results capped at 50

**Given** test data contains 55 doctors with `last_name = "Test"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Test" }`
**Then** the `doctors` array has exactly 50 elements
**And** `total_count` is 55

### 9.2 Total count reflects true count, not capped count

**Given** test data contains 55 doctors with `last_name = "Test"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Test" }`
**Then** `total_count` is 55 (not 50)

### 9.3 Fewer than 50 results — no cap applied

**Given** test data contains 3 doctors with last name starting with "Smi"
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smi" }`
**Then** the `doctors` array has exactly 3 elements
**And** `total_count` is 3

### 9.4 Exactly 50 results

**Given** test data is arranged so that exactly 50 doctors match a query
**When** the client calls `doctor-search` with that query
**Then** the `doctors` array has exactly 50 elements
**And** `total_count` is 50

### 9.5 Zero results

**Given** no doctor in the test data has `last_name` starting with "Zzz"
**When** the client calls `doctor-search` with `arguments: { "lastname": "Zzz" }`
**Then** `total_count` is 0
**And** `doctors` is an empty array
**And** `isError` is absent or `false` (zero results is not an error)

---

## 10. Output Format — Doctor Records

### 10.1 All fields present in each doctor record

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** each doctor record in the `doctors` array contains exactly the fields: `npi`, `lastname`, `firstname`, `specialty`, `gender`, `address`, `city`, `zipcode`, `phone`

### 10.2 NPI is a string

**Given** the server returns results
**When** inspecting a doctor record
**Then** `npi` is a string (not a number), e.g. `"1000000001"`

### 10.3 Gender is normalized to M/F in output

**Given** test data stores gender as `"M"` or `"F"`
**When** the client calls `doctor-search` and receives results
**Then** the `gender` field in each doctor record is `"M"` or `"F"` (not `"male"` or `"female"`)

### 10.4 Phone is a 10-digit string

**Given** the server returns results
**When** inspecting a doctor record
**Then** `phone` is a string of exactly 10 digits (e.g. `"3105551001"`)

### 10.5 Zipcode is a 5-digit string

**Given** the server returns results
**When** inspecting a doctor record
**Then** `zipcode` is a string of exactly 5 digits

### 10.6 No extra fields in doctor records

**Given** the server returns results
**When** inspecting a doctor record
**Then** no fields beyond `npi`, `lastname`, `firstname`, `specialty`, `gender`, `address`, `city`, `zipcode`, `phone` are present
**And** specifically, raw database fields like `classification`, `specialization` are not exposed

---

## 11. Output Format — Specialty Field Mapping

### 11.1 Specialty query matches only classification — classification returned

**Given** NPI 1000000002 has `classification = "Internal Medicine"` and empty `specialization`
**When** the client calls `doctor-search` with `arguments: { "specialty": "Internal" }`
**Then** NPI 1000000002's `specialty` field is `"Internal Medicine"`

### 11.2 Specialty query matches only specialization — specialization returned

**Given** NPI 1000000001 has `specialization = "Cardiovascular Disease"` and `classification = "Internal Medicine"`
**When** the client calls `doctor-search` with `arguments: { "specialty": "Cardiovascular" }`
**Then** NPI 1000000001's `specialty` field is `"Cardiovascular Disease"` (only specialization matches the prefix)

### 11.3 Specialty query matches both — longer string returned

**Given** NPI 1000000004 has `classification = "Cardiology"` and `specialization = "Interventional Cardiology"`
**When** the client calls `doctor-search` with `arguments: { "specialty": "Cardio" }`
**Then** NPI 1000000004's `specialty` field is `"Interventional Cardiology"` (the longer of the two matching strings)

### 11.4 Specialty field when no specialty filter used — longer of the two

**Given** NPI 1000000001 has `classification = "Internal Medicine"` and `specialization = "Cardiovascular Disease"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** NPI 1000000001's `specialty` field is `"Cardiovascular Disease"` (the longer of classification and specialization)

---

## 12. Search Logic — No Results (Valid Queries)

### 12.1 Non-matching lastname

**Given** no doctor has a last name starting with "Xyz"
**When** the client calls `doctor-search` with `arguments: { "lastname": "Xyz" }`
**Then** `total_count` is 0 and `doctors` is `[]`
**And** `isError` is absent or `false`

### 12.2 Non-matching specialty

**Given** no doctor has a classification or specialization starting with "Xyz"
**When** the client calls `doctor-search` with `arguments: { "specialty": "Xyz" }`
**Then** `total_count` is 0 and `doctors` is `[]`
**And** `isError` is absent or `false`

### 12.3 Matching lastname but non-matching zipcode

**Given** `Smith` exists in `90210` but not in `99999`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": "99999" }`
**Then** `total_count` is 0 and `doctors` is `[]`

### 12.4 Matching specialty but non-matching gender

**Given** `Internal Medicine` doctors exist but none are in zipcode `00000`
**When** the client calls `doctor-search` with `arguments: { "specialty": "Internal", "zipcode": "00000" }`
**Then** `total_count` is 0 and `doctors` is `[]`

---

## 13. Edge Cases — Input

### 13.1 Additional properties rejected

**Given** the input schema has `additionalProperties: false`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "state": "CA" }`
**Then** the response has `isError: true` or the server rejects the unknown property

### 13.2 Non-string parameter types

**Given** the schema defines all parameters as strings
**When** the client calls `doctor-search` with `arguments: { "lastname": 12345 }`
**Then** the response has `isError: true` (type mismatch)

### 13.3 Null parameter value

**Given** the schema defines parameters as strings
**When** the client calls `doctor-search` with `arguments: { "lastname": null }`
**Then** the response has `isError: true`

### 13.4 Lastname — very long input

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz" }`
**Then** the response is successful with `total_count: 0` and `doctors: []` (no match, but no crash)

### 13.5 Specialty — very long input

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "specialty": "Abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz" }`
**Then** the response is successful with `total_count: 0` and `doctors: []`

### 13.6 Lastname — SQL injection attempt

**Given** the server uses parameterized queries
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith'; DROP TABLE doctors; --" }`
**Then** the response has `isError: true` (validation rejects special characters)
**And** the database is not affected

### 13.7 Specialty — SQL injection attempt

**Given** the server uses parameterized queries
**When** the client calls `doctor-search` with `arguments: { "specialty": "'; DROP TABLE doctors; --" }`
**Then** the response has `isError: true` (validation rejects special characters)
**And** the database is not affected

### 13.8 Lastname — ASCII alphabetic accepted

**Given** the validation only accepts alphabetic characters and hyphens
**When** the client calls `doctor-search` with `arguments: { "lastname": "Muller" }`
**Then** the response is successful (ASCII alphabetic)

### 13.8b Lastname — unicode accented characters rejected

**Given** the validation only accepts ASCII alphabetic characters and hyphens
**When** the client calls `doctor-search` with `arguments: { "lastname": "Müller" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### 13.9 Whitespace-only lastname

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "   " }`
**Then** the response has `isError: true`

### 13.10 Zipcode — leading/trailing whitespace

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "zipcode": " 90210 " }`
**Then** the response has `isError: true` (whitespace not allowed in zipcode)

---

## 14. Edge Cases — Data

### 14.1 Doctor with empty specialization

**Given** NPI 1000000002 has `specialization` as empty
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** NPI 1000000002 is included in results
**And** NPI 1000000002's `specialty` field contains the `classification` value

### 14.2 Doctor with empty classification

**Given** a doctor exists with empty `classification` but non-empty `specialization`
**When** the client calls `doctor-search` with a matching query
**Then** the doctor's `specialty` field contains the `specialization` value

### 14.3 Doctor with both classification and specialization empty

**Given** a doctor exists with both fields empty
**When** the client calls `doctor-search` with `arguments: { "lastname": "<matching>" }`
**Then** the doctor is included in results
**And** the `specialty` field is an empty string or a reasonable default

### 14.4 Hyphenated last names match correctly

**Given** NPI 1000000006 has `last_name = "O-Brien"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "O-B" }`
**Then** the result contains NPI 1000000006

### 14.5 Specialty with hyphen matches

**Given** test data contains a classification like "Non-Surgical" or a specialization with a hyphen
**When** the client calls `doctor-search` with `arguments: { "specialty": "Non-Sur" }`
**Then** the result contains the matching doctor

---

## 15. Internal Error Handling

### 15.1 Database unavailable

**Given** the SQLite database file is missing or corrupted
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** the response has `isError: true`
**And** the message is `"Internal error: please try again later."`
**And** no internal details (file paths, stack traces) are leaked

### 15.2 Internal error format

**Given** a database query fails for any reason
**When** the error is returned to the client
**Then** the response has `isError: true`
**And** `content` is `[{ type: "text", text: "Internal error: please try again later." }]`
**And** the error message does not vary based on the internal cause

---

## 16. Response Structure Integrity

### 16.1 Successful response is valid JSON

**Given** the server returns a successful result
**When** the `text` field of the content block is parsed
**Then** it is valid JSON
**And** contains `total_count` as a number
**And** contains `doctors` as an array

### 16.2 Error response is plain text, not JSON

**Given** the server returns a validation error
**When** examining the `text` field of the content block
**Then** it is a plain text error message (not wrapped in JSON)

### 16.3 Content block structure on success

**Given** a successful tool call
**When** examining the response
**Then** `content` has exactly one element
**And** that element has `type: "text"`
**And** `isError` is absent or `false`

### 16.4 Content block structure on error

**Given** a failed tool call (validation error)
**When** examining the response
**Then** `content` has exactly one element
**And** that element has `type: "text"`
**And** `isError` is `true`

---

## 17. Validation Priority

### 17.1 Validation happens before search

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "S" }` (too short)
**Then** the response has `isError: true` with a validation message
**And** no database query is executed (the error is returned immediately)

### 17.2 All fields validated before any search

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Sm", "zipcode": "abc" }`
**Then** the response has `isError: true`
**And** the error is a validation error (not a search result)

---

## 18. Validation Ordering

### 18.1 Field validation order is deterministic

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "S", "specialty": "X", "gender": "xyz", "zipcode": "abc" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."` (lastname validated first)

---

## 19. Result Ordering

### 19.1 Results are returned in a deterministic order

**Given** test data contains 55 doctors with `last_name = "Test"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Test" }` twice
**Then** both responses return the same 50 doctors in the same order

### 19.2 Results are sorted by NPI ascending

**Given** test data contains multiple matching doctors
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** the `doctors` array is sorted by `npi` in ascending order

---

## 20. Specialty Field Default (No Specialty Filter)

### 20.1 No specialty filter, both fields populated — longer returned

**Given** NPI 1000000001 has `classification = "Internal Medicine"` and `specialization = "Cardiovascular Disease"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** NPI 1000000001's `specialty` field is `"Cardiovascular Disease"` (the longer of classification and specialization)

### 20.2 No specialty filter, only specialization populated

**Given** a doctor has empty `classification` and `specialization = "Cardiovascular Disease"`
**When** found via lastname search
**Then** the doctor's `specialty` field is `"Cardiovascular Disease"`

### 20.3 No specialty filter, only classification populated

**Given** NPI 1000000002 has `classification = "Internal Medicine"` and empty `specialization`
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** NPI 1000000002's `specialty` field is `"Internal Medicine"`

---

## 21. Gender Case Sensitivity

### 21.1 Gender "MALE" (uppercase) rejected

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "MALE" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."`

### 21.2 Gender "Male" (title case) rejected

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "Male" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."`

### 21.3 Gender "FEMALE" (uppercase) rejected

**Given** the server is initialized
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith", "gender": "FEMALE" }`
**Then** the response has `isError: true`
**And** the message is `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."`

---

## 22. Prefix Matching Boundaries

### 22.1 Specialty prefix matches classification and specialization across different doctors

**Given** NPI 1000000007 has `classification = "Psychiatry"` and NPI 1000000004 has `specialization = "Interventional Cardiology"`
**When** the client calls `doctor-search` with `arguments: { "specialty": "Psych" }`
**Then** the result contains NPI 1000000007
**And** the OR logic matches against classification and specialization independently per doctor

### 22.2 Lastname prefix — hyphen in the middle of prefix

**Given** NPI 1000000006 has `last_name = "O-Brien"`
**When** the client calls `doctor-search` with `arguments: { "lastname": "O-Bri" }`
**Then** the result contains NPI 1000000006

---

## 23. Repeated Calls — Consistency

### 23.1 Multiple sequential calls return consistent results

**Given** the server has been initialized
**When** the client makes 3 identical calls with `arguments: { "lastname": "Smith" }`
**Then** all 3 responses have identical `total_count` and `doctors` arrays (no state mutation between calls)

---

## 24. Empty Database

### 24.1 Valid query against empty database

**Given** the SQLite database has the `doctors` table but zero rows
**When** the client calls `doctor-search` with `arguments: { "lastname": "Smith" }`
**Then** `total_count` is 0 and `doctors` is `[]`
**And** `isError` is absent or `false` (empty database is not an error)

---

## 25. Specialty Tiebreaker — Equal Length

### 25.1 Both classification and specialization match with different lengths — longer wins

**Given** a doctor has `classification = "Sports Medicine"` (15 chars) and `specialization = "Sports Orthopedics"` (18 chars)
**When** the client calls `doctor-search` with `arguments: { "specialty": "Sports" }`
**Then** the doctor's `specialty` field is `"Sports Orthopedics"` (the longer string)

### 25.2 Both classification and specialization match with equal length — classification wins

**Given** a doctor has `classification = "Sleep Medicine"` (14 chars) and `specialization = "Sleep Disorder"` (14 chars)
**When** the client calls `doctor-search` with `arguments: { "specialty": "Sleep" }`
**Then** the doctor's `specialty` field is `"Sleep Medicine"` (classification used as tiebreaker)

---

## Test Summary

| Category | Test Count | Coverage |
|----------|-----------|----------|
| MCP Protocol Compliance | 5 | Server init, tool listing, success/error format, unknown tool |
| Filter Combination Rules | 11 | All valid/invalid combinations of required filters |
| Individual Field Validation | 32 | Boundary values, invalid characters, empty strings for each field |
| Multiple Invalid Fields | 3 | Simultaneous validation errors |
| Prefix Matching | 7 | Lastname and specialty prefix behavior |
| Case Insensitivity | 8 | Upper/lower/mixed case for all filterable fields |
| Exact Matching | 3 | Zipcode and gender exact match |
| AND Combination | 5 | Two, three, and four filter intersections |
| Result Cap & Total Count | 5 | Cap at 50, total_count accuracy, boundary cases |
| Output Format | 6 | Field presence, types, normalization |
| Specialty Field Mapping | 4 | Classification/specialization selection logic |
| No Results | 4 | Valid queries returning zero matches |
| Edge Cases — Input | 11 | SQL injection, unicode, whitespace, long strings, type mismatches |
| Edge Cases — Data | 5 | Empty fields, hyphens in data |
| Internal Errors | 2 | Database failure, error message consistency |
| Response Structure | 4 | JSON validity, content block format |
| Validation Priority | 2 | Validation-before-search guarantee |
| Validation Ordering | 1 | Deterministic field validation order |
| Result Ordering | 2 | Deterministic sort order, NPI ascending |
| Specialty Field Default | 3 | Default behavior when no specialty filter used |
| Gender Case Sensitivity | 3 | Uppercase/title-case variants rejected |
| Prefix Matching Boundaries | 2 | Cross-doctor OR logic, hyphen in prefix |
| Repeated Calls | 1 | Consistency across sequential calls |
| Empty Database | 1 | Valid query against zero rows |
| Specialty Tiebreaker | 2 | Equal-length and different-length tiebreaker |
| **Total** | **132** | |
