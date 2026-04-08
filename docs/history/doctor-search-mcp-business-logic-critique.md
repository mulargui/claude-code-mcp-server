# Doctor Search MCP Server — Business Logic Critique

## Scope

Review of `src/validate.ts`, `src/search.ts`, and their test suites (`src/__tests__/validate.test.ts`, `src/__tests__/search.test.ts`).

## Overall

The implementation is solid. It follows the spec closely, uses parameterized queries, has clear structure, and the test coverage is thorough. What follows are the issues found, ranked by severity.

---

## Issues

### 1. `RawRow` types nullable columns as `string` — silent null leakage

**File:** `src/search.ts:39-50`

The schema defines `classification`, `specialization`, `gender`, `address`, `city`, `zipcode`, and `phone` as nullable (`TEXT` without `NOT NULL`). `better-sqlite3` returns `null` for SQL NULL values. But `RawRow` types all fields as `string`, and the mapping at lines 75-84 passes them straight through to the output. If any row has a NULL column, the output will contain `null` despite `DoctorRecord` declaring `string`.

`resolveSpecialty` handles this for `classification`/`specialization` via `|| ""`, but `gender`, `address`, `city`, `zipcode`, and `phone` have no such guard.

**Impact:** Likely low given the data set, but a runtime type violation. An LLM consumer getting `"gender": null` when the type says `string` could produce confusing behavior.

**Fix:** Either type nullable fields as `string | null` in `RawRow` and add `?? ""` fallbacks in the mapper, or keep the current approach and add a comment acknowledging the assumption that the data import guarantees non-null values.

---

### 2. Validation allows degenerate inputs: all-hyphen lastnames, all-space specialties

**File:** `src/validate.ts:13-14`

`LASTNAME_RE = /^[A-Za-z-]+$/` accepts `"---"` (3 hyphens). `SPECIALTY_RE = /^[A-Za-z -]+$/` accepts `"   "` (3 spaces). Both pass length and regex checks.

These produce harmless LIKE queries that return zero results, so it's not a functional bug. But it's imprecise validation — the spec says "alphabetic characters only" / "alphabetic characters, spaces, and hyphens only," implying at least some alphabetic content.

**Fix:** Require at least one alphabetic character:
- `LASTNAME_RE = /^[A-Za-z][A-Za-z-]*$/` (must start with a letter)
- `SPECIALTY_RE = /^(?=.*[A-Za-z])[A-Za-z -]+$/` (must contain at least one letter)

---

### 3. SQL `COLLATE NOCASE` placement is misleading

**File:** `src/search.ts:60, 65-66`

```sql
last_name LIKE ? || '%' COLLATE NOCASE
```

SQLite operator precedence: `COLLATE` > `||` > `LIKE`. This parses as:

```sql
last_name LIKE (? || ('%' COLLATE NOCASE))
```

Not the intuitive reading of "LIKE comparison using NOCASE." It works in practice because SQLite propagates the collation of the right-hand operand to the LIKE comparison, and SQLite's LIKE is case-insensitive for ASCII by default anyway. But the intent is obscured.

**Fix:** Be explicit with parentheses: `last_name COLLATE NOCASE LIKE ? || '%'` or just drop `COLLATE NOCASE` entirely since SQLite LIKE is already case-insensitive for ASCII (as the architecture doc itself notes).

---

### 4. Gender/zipcode exact match doesn't use `COLLATE NOCASE`

**File:** `src/search.ts:70, 75`

The architecture doc says: "All other filters are direct equality checks (case-insensitive via `COLLATE NOCASE`)." The implementation uses plain `=` without NOCASE for both gender and zipcode.

This is functionally correct — gender is normalized to `M`/`F` before querying, and zipcodes are digits. But it's a deviation from the stated architecture.

**Impact:** None in practice. Documenting the deviation or adding NOCASE for consistency would be cleaner.

---

### 5. `resolveSpecialty` can return empty string

**File:** `src/search.ts:24-37`

When a doctor has both `classification` and `specialization` as empty/null and no specialty filter is active, `resolveSpecialty` returns `""`. This produces a doctor record with `specialty: ""` in the API output.

The spec doesn't address this edge case. Whether this matters depends on the data — if the import guarantees at least `classification` is populated, it's fine. But there's no defensive guard.

---

### 6. No tests for `resolveSpecialty` with empty/null columns

The test suite covers the tiebreaker and prefix matching well, but there's no test for the case where both `classification` and `specialization` are empty. This ties into issue #5.

---

### 7. Minor: `normalizeGender` passthrough branch

**File:** `src/search.ts:19`

```ts
if (gender === "male") return "M";
if (gender === "female") return "F";
return gender;
```

The passthrough `return gender` handles `"M"` and `"F"` but also silently passes through any other value. Validation prevents this, so it's not a real bug — just worth noting that `search.ts` trusts `validate.ts` completely here. This is the correct design given the error flow described in the architecture doc.

---

## What's Done Well

- **Parameterized queries throughout** — no SQL injection surface, even without the validation guards
- **Validation regex blocks LIKE wildcards** (`%`, `_`) — so user input can't manipulate prefix matching
- **Clean separation** — validate returns early with a message, search assumes valid input. Clean contract.
- **Two-phase validation** with deterministic ordering matches the spec
- **Test coverage** is excellent — prefix matching, case insensitivity, gender normalization, AND combinations, result cap, tiebreakers, and edge cases are all covered
- **`resolveSpecialty`** correctly implements the spec's "longer of classification/specialization when both match" rule with classification winning ties

---

## Summary

Issues #1 and #2 are worth fixing. Issues #3-4 are worth cleaning up. Issues #5-7 are informational. The implementation is well-aligned with the spec and ready to build on.
