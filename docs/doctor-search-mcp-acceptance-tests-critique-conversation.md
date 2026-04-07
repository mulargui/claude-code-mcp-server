# Doctor Search MCP Server — Acceptance Tests Critique Conversation

## Session Summary

Reviewed the acceptance tests document from a senior product manager perspective, critiqued existing tests, and applied fixes and additions.

## Critique

Identified 6 issues in the existing 116-test suite:

1. **Test 13.8 (Unicode) broken** — both test cases had identical input `"Muller"` instead of one being `"Müller"`
2. **Test 11.4 unresolved** — punted to the spec instead of asserting concrete behavior for the specialty field default
3. **Test 4.1 too vague** — said "identifies at least the first invalid field" instead of asserting an exact error message
4. **Test 4.2 similarly vague** — said "addresses the combination rule OR the invalid gender" instead of picking one
5. **No result ordering tests** — the 50-cap tests are non-deterministic without a defined sort order
6. **Test data too small** — only 7 named records plus 50+ "Test" records

Critique saved to `doctor-search-mcp-acceptance-tests-critique.md`.

## Fixes Applied

### Test 13.8 — Split into two distinct tests
- **13.8**: ASCII `"Muller"` is accepted
- **13.8b**: Unicode `"Müller"` (with umlaut) is rejected with validation error

### Test 11.4 — Resolved spec gap
- Default specialty when no specialty filter is used: return the longer of classification and specialization
- Now asserts `"Cardiovascular Disease"` (22 chars) over `"Internal Medicine"` (17 chars)

### Test 4.1 — Tightened assertion
- Now asserts exact message: `"Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."`

### Test 4.2 — Tightened assertion
- Now asserts combination rule fires first: `"At least 'lastname' or 'specialty' must be included as a filter."`

## New Test Sections Added (18-25)

| Section | Tests | Coverage |
|---------|-------|----------|
| 18. Validation Ordering | 1 | Deterministic field validation order (lastname first) |
| 19. Result Ordering | 2 | Deterministic results, sorted by NPI ascending |
| 20. Specialty Field Default | 3 | Longer-of-two when no specialty filter, single-field fallbacks |
| 21. Gender Case Sensitivity | 3 | MALE, Male, FEMALE all rejected (enum is exact-match) |
| 22. Prefix Matching Boundaries | 2 | Cross-doctor OR logic, hyphen in middle of prefix |
| 23. Repeated Calls | 1 | Consistency across sequential identical calls |
| 24. Empty Database | 1 | Zero rows returns empty result, not error |
| 25. Specialty Tiebreaker | 2 | Different-length (longer wins), equal-length (classification wins) |

## Spec Decisions Made

- **Specialty default (no filter)**: return the longer of classification and specialization
- **Specialty tiebreaker (equal length)**: classification wins
- **Result ordering**: sorted by NPI ascending
- **Validation order**: combination rules first, then fields in order: lastname, specialty, gender, zipcode
- **Gender enum**: exact-match only, case-sensitive (`male`, `female`, `M`, `F`)

## Final State

Test count went from 116 to 132 tests across 25 sections.
