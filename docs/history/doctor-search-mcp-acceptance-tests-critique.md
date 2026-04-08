# Doctor Search MCP Server — Acceptance Tests Critique

## Strengths

The test suite is thorough at 116 tests. The Given-When-Then format is clean and unambiguous. Validation coverage is excellent — every field, every boundary, every invalid combination. The specialty field mapping tests (section 11) catch a subtle and easy-to-break behavior. SQL injection tests are there.

## Issues

### 1. Test 13.8 (Unicode) is broken

The two test cases show identical input `"Muller"` — one was clearly meant to be `"Müller"` with an umlaut. As written, both are the same test.

### 2. Test 11.4 is unresolved

It says "the spec should define a default" for the specialty field when no specialty filter is used. This is a gap in the spec that the acceptance test should not carry — it should assert a concrete expected behavior, not punt to the spec. The architecture doc says "longer of classification/specialization when both match the query prefix," but when there's no specialty filter, neither is "matched." This needs a decision: default to classification? Longer of the two? Concatenate?

### 3. Test 4.1 is too vague

"The message identifies at least the first invalid field" — which field? What message? Every other validation test asserts an exact error string. This one should too. If the server validates fields in a defined order (combination rules first, then lastname, specialty, gender, zipcode), state that order and assert the specific message.

### 4. Test 4.2 is similarly vague

"Addresses the combination rule OR the invalid gender" — pick one. The validation priority is defined (validate all fields before search, per section 17), so the expected behavior should be deterministic.

### 5. No test for ordering/determinism of results

The spec says "first 50 are returned" when results exceed the cap. What determines order? If it's unspecified, the results are non-deterministic, which makes test 9.1 fragile — you can't assert *which* 50 you got. Either the spec needs to define sort order, or the test should only assert the count without checking specific records.

### 6. Test data is too small for realistic edge cases

Only 7 named records plus 50+ "Test" records. This is fine for logic, but it means you never test scenarios where multiple filters interact with large result sets being capped.

## Suggested Additional Tests

### A. Validation ordering (replace vague 4.1/4.2)

#### A.1 Combination rule checked before field validation

**Given** arguments `{ "gender": "xyz" }`
**When** the client calls `doctor-search`
**Then** the message is `"At least 'lastname' or 'specialty' must be included as a filter."` (combination rule fires first, before gender is validated)

#### A.2 Field validation order is deterministic

**Given** arguments `{ "lastname": "S", "specialty": "X", "gender": "xyz", "zipcode": "abc" }`
**When** the client calls `doctor-search`
**Then** the message is `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."` (lastname validated first)

### B. Result ordering

#### B.1 Results are returned in a deterministic order

**Given** 55 doctors with `last_name = "Test"` exist
**When** the client calls `doctor-search` with `{ "lastname": "Test" }` twice
**Then** both responses return the same 50 doctors in the same order

#### B.2 Sort order defined (if spec defines one — e.g., by NPI ascending)

**Given** multiple matching doctors
**When** the client calls `doctor-search`
**Then** results are sorted by `npi` ascending (or whatever the spec defines)

### C. Specialty field default (when no specialty filter)

#### C.1 No specialty filter, both fields populated — returns classification

**Given** NPI 1000000001 has classification "Internal Medicine" and specialization "Cardiovascular Disease"
**When** the client calls `doctor-search` with `{ "lastname": "Smith" }`
**Then** NPI 1000000001's specialty field is `"Internal Medicine"` (classification is the default when no prefix match context exists)

#### C.2 No specialty filter, only specialization populated

**Given** a doctor has empty classification and specialization "Cardiovascular Disease"
**When** found via lastname search
**Then** specialty field is `"Cardiovascular Disease"`

### D. Gender case sensitivity in input

#### D.1 Gender "MALE" (uppercase) rejected

**Given** arguments `{ "lastname": "Smith", "gender": "MALE" }`
**Then** `isError: true` with message `"Invalid gender: must be one of 'male', 'female', 'M', 'F'."` (the enum is exact-match, not case-insensitive)

#### D.2 Gender "Male" (title case) rejected

**Given** arguments `{ "lastname": "Smith", "gender": "Male" }`
**Then** same error.

### E. Prefix matching boundaries

#### E.1 Specialty prefix that matches classification of one doctor and specialization of a different doctor

**Given** NPI A has classification "Psychiatry" and NPI B has specialization "Psychiatry - Child"
**When** `{ "specialty": "Psych" }`
**Then** both doctors are returned (ensures OR logic across classification/specialization works across different records, not just within one)

#### E.2 Lastname prefix — hyphen at prefix boundary

**Given** NPI 1000000006 has last_name "O-Brien"
**When** `{ "lastname": "O-Bri" }`
**Then** result contains NPI 1000000006 (hyphen in the middle of a prefix works)

### F. Concurrent/repeated calls

#### F.1 Multiple sequential calls return consistent results

**Given** the server has been initialized
**When** the client makes 3 identical calls with `{ "lastname": "Smith" }`
**Then** all 3 return identical responses (no state mutation between calls)

### G. Empty database

#### G.1 Valid query against empty database

**Given** the SQLite database has the doctors table but zero rows
**When** the client calls `doctor-search` with `{ "lastname": "Smith" }`
**Then** `total_count: 0` and `doctors: []` (not an error)

### H. Specialty output tiebreaker

#### H.1 Both match, different lengths — longer wins

**Given** a doctor has classification "Sports Medicine" and specialization "Sports Orthopedics"
**When** `{ "specialty": "Sports" }`
**Then** specialty field is `"Sports Orthopedics"` (longer wins)

#### H.2 Both match, exactly equal length

**Given** a doctor has classification and specialization of equal length, both starting with the same prefix
**When** the specialty filter matches both
**Then** specialty field is... which one? The spec says "longer" but doesn't define the tiebreaker. Needs a decision.

## Summary

| Category | Count |
|----------|-------|
| Issues found in existing tests | 6 |
| New tests suggested | ~14 |

### Priority Action Items

1. **Fix test 13.8** (unicode) — the two inputs are identical
2. **Resolve spec gap for test 11.4** — decide the default specialty field behavior when no specialty filter is used
3. **Define result ordering** — without this, the 50-cap tests are non-deterministic
4. **Tighten tests 4.1 and 4.2** — replace vague assertions with exact expected messages
5. **Add gender case-sensitivity tests** — the enum in the schema is `["male", "female", "M", "F"]` but it's unclear if "Male" or "FEMALE" should be accepted
6. **Add the equal-length specialty tiebreaker test** — forces a spec decision
