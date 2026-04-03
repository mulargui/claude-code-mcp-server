# Doctor Search MCP Server — Interface Critique

## Good

The document is well-structured — it clearly separates server info, input schema, output format, errors, and MCP protocol details. The tool description is well-written for LLM consumption (explains prefix matching, constraints, and the cap). Error messages are specific and actionable. The JSON Schema is properly constrained with `additionalProperties: false`.

## Issues

**1. `state` filter is still missing**

Both the spec critique and architecture critique flagged this. The architecture added the `state` column, but the interface doesn't expose it as a filter. "Find a cardiologist in California" remains impossible. This is the most impactful gap — zip code is too narrow for geographic filtering without knowing the exact code.

**2. No `firstname` filter**

Same omission flagged in both prior critiques. The output returns `firstname`, the data has it, but there's no way to filter by it. "Find Dr. John Smith" can't be expressed. This is a trivial addition and its absence is noticeable.

**3. The `gender` enum is awkward — four values that collapse to two**

`["male", "female", "M", "F"]` in the schema means the LLM has to pick one of four values that mean two things. This is fine as a convenience, but the schema `enum` suggests these are four distinct values. Consider either: (a) just `["M", "F"]` with the description noting that `male`/`female` are also accepted, or (b) document the normalization in the schema description, not just in the tool description. Right now the description says nothing about normalization — only the architecture doc mentions it.

**4. The `specialty` output field mapping is underspecified**

The description says "longer of classification/specialization when both match the query prefix" — but what happens when the query has no specialty filter? If I search by `{"lastname": "Smith"}`, what goes in the `specialty` field? The longer of the two? Classification by default? This needs a default rule for the non-specialty-filtered case.

**5. No `state` in the output record**

Even setting aside the missing filter — the output includes `address`, `city`, `zipcode` but not `state`. That's an incomplete address. An LLM presenting results to a user can't show where the doctor is located beyond the city name, which can be ambiguous (Portland, OR vs Portland, ME).

**6. Phone number format is unspecified**

The example shows `"3105551234"` (10 raw digits), but the interface doesn't state the format. Will it always be 10 digits? Could it have extensions? Country codes? The LLM (or end user) will need to format this for display.

**7. No ordering guarantee**

The interface says results are "capped at 50" but doesn't specify ordering. Are they alphabetical? By NPI? Random? If a user refines a query, will they get consistent ordering? This matters when `total_count > 50` — the user has no way to know which 50 they're seeing or how to get different ones.

**8. `total_count` without any way to access beyond the first 50**

You're telling the client "there are 142 matches" but giving them 50 with no pagination, no offset, no cursor. This is informational dead weight — it creates the expectation that more results are retrievable. Either add an `offset` parameter or drop `total_count` in favor of a simple `"truncated": true` boolean.

**9. Case sensitivity not documented in the interface**

The architecture uses `COLLATE NOCASE` throughout, meaning `"smith"` matches `"Smith"`. The interface is silent on this. Since LLMs will generate queries with varying casing, this is important to state explicitly — either in the tool description or the field descriptions.

**10. The tool description says "at least lastname or specialty must be provided" but the schema marks everything optional**

This is correctly noted under "constraints not expressible in JSON Schema," but the tool description itself should make this more prominent. An LLM reading the description might stop at "Search... by last name, specialty, gender, and/or zip code" and try `{"zipcode": "90210"}` alone, only to get rejected. The constraint is mentioned at the end of the description but could be stronger (e.g., lead with it).

## Minor

- The `pattern: "^[0-9]{5}$"` regex in the schema for zipcode is good, but not all MCP clients validate JSON Schema patterns client-side. The server-side validation is the real gate, so this is cosmetic — fine to keep but don't rely on it.
- The error table doesn't cover unexpected server errors (e.g., SQLite file missing/corrupt). What does the client see if the DB fails to open? An MCP-level error? A tool error with `isError: true`? This should be defined.

## Summary

The interface is solid for the happy path. The biggest gaps are the missing `state` filter/output and `firstname` filter — both flagged in earlier critiques and still unaddressed. The `total_count` without pagination creates a misleading signal. And several behavioral details (case sensitivity, ordering, specialty field mapping without a specialty query, phone format) are left ambiguous in ways that will cause inconsistent client behavior.
