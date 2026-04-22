# Product Critique: `specialty-list` Feature Documentation

## What's done well

**Clear user story.** The tool description — "Use this to discover valid specialty values before searching with doctor-search" — establishes the *why* concisely. It positions `specialty-list` as a discovery mechanism that feeds into `doctor-search`, which is the right framing.

**Consistent documentation.** The feature is threaded through all six documents with matching field names, error messages, and SQL. Nothing contradicts.

**Minimal surface area.** Zero parameters, one output field. Hard to misuse. Good instinct for a v1.

---

## Issues to address

### 1. The spec doesn't explain why `classification` and not `specialization`.

The `doctor-search` tool searches *both* columns, but `specialty-list` only returns values from `classification`. A user who discovers "Internal Medicine" via `specialty-list`, then searches with `specialty: "Internal"`, will also get matches from the `specialization` column — values they never saw in the list. This creates a confusing asymmetry.

The spec should either:
- Explain why `classification` alone is sufficient (e.g., it represents the primary taxonomy category and is always populated), or
- Acknowledge the gap and state it's a deliberate simplification

### 2. No guidance on list size or what to expect.

How many specialties are there? 10? 50? 500? The spec and interface doc give no indication. This matters because:
- An LLM consuming this tool needs to know whether to present the full list to the user or summarize it
- If there are hundreds of values, returning them all in one response may not be the best UX

The spec should state the approximate cardinality (e.g., "typically 50-100 distinct values") so consumers can plan accordingly.

### 3. The tool description says "specialties" but returns classifications.

The field is called `specialties` and the tool is called `specialty-list`, but the values come from the `classification` column — which contains things like "Massage Therapist", "Pharmacist", "Counselor". These aren't what most users would consider medical *specialties*. This is a naming/expectation mismatch inherited from `doctor-search`, but `specialty-list` makes it more visible because users will see the full list.

The spec should acknowledge this: the term "specialty" is used broadly to mean provider classification/type, not strictly medical specialties.

### 4. No acceptance test for the total count or completeness.

Test 26.5 checks that 6 known specialties are present, but there's no test asserting the *total* number of specialties returned. For `doctor-search`, test 9.1 explicitly verifies the count (55 total, 50 returned). A similar test for `specialty-list` would catch regressions where specialties are silently dropped.

### 5. Test 26.7 (unexpected arguments) is ambiguous by design.

The test says "the response has `isError: true` *or* the server rejects the unknown property" and the implementation accepts either outcome. This is reasonable given MCP SDK behavior uncertainty, but from a product perspective we should *decide* what we want. If we set `additionalProperties: false` in the schema, we should own that contract and test for rejection specifically.

### 6. The spec example uses placeholder `"..."` — should show the real shape.

The example response in the spec shows `"Allergy & Immunology", "Anesthesiology", "Cardiology", "Dermatology", "..."`. A more useful example would show 5-6 real values *and* state the approximate total, so a reader understands the scale without running the tool.

### 7. No discussion of caching or performance in the architecture doc.

`doctor-search` re-queries on every call, which makes sense for filtered queries. But `specialty-list` returns the same data every time (the DB is read-only). The architecture doc doesn't mention whether this could or should be cached. For a read-only DB this is low-priority, but it's worth a one-line note saying "no caching needed — the DB is immutable at runtime."

---

## Minor observations

- The architecture doc SQL says `WHERE classification IS NOT NULL` but the business logic doc says `WHERE classification IS NOT NULL AND classification != ''`. The implementation uses the latter. The architecture doc should match.
- The acceptance test document summary says 141 total but lists 132 + 9 = 141. The math checks out, but the summary text in the overview still says "the full surface: MCP protocol compliance, input validation, search logic, output format, and error handling" without mentioning "specialty listing." Minor but worth adding for scannability.

---

## Recommendation

Issues 1-3 are the most important — they're about *clarity of the product contract*. A user reading the spec should understand what "specialty" means in this context, why they're only seeing classification values, and roughly how many to expect. These are one-paragraph additions, not redesigns.
