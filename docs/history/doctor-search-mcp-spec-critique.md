# Doctor Search MCP Server — Spec Critique

## Critical Issues

**1. No result pagination or limit**
The spec has no cap on result count. A query like `{"speciality": "Internal Medicine"}` could return thousands of records, blowing up context windows for LLM clients. You need a `limit` parameter (with a sensible default, e.g. 50) and ideally a way to paginate or signal "more results available."

**2. The `speciality` typo is baked into the API surface**
"Speciality" is used throughout instead of "specialty." This is a permanent usability tax — every client will need to remember the unusual spelling. If this is intentional (matching the source data), document why. If not, fix it now before anyone integrates.

**3. No result count or "no results" behavior defined**
What happens when the query is valid but matches zero doctors? The spec says "a list of doctor records" but doesn't specify whether that's an empty array, a message, or structured differently. LLM clients need clear guidance here to avoid hallucinating results.

## Important Gaps

**4. Gender handling is exclusionary and underspecified**
Only `male`/`female`/`M`/`F` are valid — `"other"` is explicitly shown as an error. This is a product decision that should be made deliberately, not as a side effect of validation. If it's a data limitation (NPI only records M/F), say so explicitly and consider accepting but gracefully handling non-binary inputs rather than hard-rejecting.

**5. No search flexibility — exact match only**
The spec implies exact matching for `lastname`. Users searching for "Smi" won't find "Smith." Prefix/partial matching is table stakes for a search tool. An LLM calling this tool will have to guess exact spellings, which is fragile. At minimum, support prefix matching on `lastname`.

**6. Missing `state` filter**
You have `zipcode`, `city` (in the output), and `address`, but no way to filter by state. "Find me a cardiologist in California" is a very natural query that this tool can't handle. The NPI data almost certainly has state — expose it.

**7. Case sensitivity not specified in the spec**
The architecture says `COLLATE NOCASE`, but the functional spec is silent on whether `"smith"` matches `"Smith"`. This needs to be in the spec since it affects how clients construct queries.

## Moderate Concerns

**8. Output doesn't include NPI number**
You're storing `npi` as the primary key but not returning it. The NPI is the universal doctor identifier — it's useful for deduplication, lookups in other systems, and verifying results. Include it in the output.

**9. No tool description for LLM discovery**
The spec doesn't define the MCP tool `description` field. This is what LLMs read to decide when to invoke the tool. A weak description means the tool won't get called when it should. Draft the actual description string.

**10. Specialty validation is opaque**
"Must be a recognized specialty" — but the user (or LLM) has no way to discover valid specialties. Consider either: (a) a second tool like `list-specialties` that returns valid values, or (b) fuzzy matching with "did you mean?" suggestions. Without this, the LLM will guess and fail repeatedly.

**11. No `firstname` filter**
You return `firstname` but can't filter by it. "Find Dr. John Smith" requires filtering client-side. This seems like a missing feature.

## Minor / Polish

**12. Phone number format not specified** — Is it `(555) 123-4567`, `5551234567`, or something else? Clients may need to format it.

**13. Examples don't show successful output** — The spec shows input examples but no example response payloads. Add at least one complete request/response example.

**14. Zipcode is string but validated as 5 digits** — This silently excludes ZIP+4 codes (`90210-1234`). Document this or handle the extended format.

## Summary

The spec covers the happy path well but is missing several things a real user (or LLM) will hit immediately: result limits, partial name matching, discoverability of valid specialties, and state-level filtering. The biggest risk is that without pagination, a broad query will return a payload too large for the consuming LLM to handle, making the tool unreliable in practice. I'd prioritize fixing that, adding a `list-specialties` companion tool, and supporting prefix search on `lastname` before building.
