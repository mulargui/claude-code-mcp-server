# Engineering Critique: `specialty-list` Feature Documentation

## What's done well

**Implementation is tight.** The function is 8 lines, the SQL does all the work (DISTINCT, WHERE, ORDER BY), no post-processing needed beyond a `.map()`. No over-engineering.

**Test coverage is layered properly.** Unit tests for `listSpecialties()` directly, server tests with mocks for routing/error handling, acceptance tests through the full MCP protocol. Each layer tests different concerns without redundancy.

**Error handling is consistent.** The try/catch in `server.ts` follows the exact same pattern as `doctor-search` — generic message, `isError: true`, no leaked internals.

---

## Issues to address

### 1. SQL inconsistency between architecture doc and implementation.

The architecture doc (line 114) specifies:
```sql
SELECT DISTINCT classification FROM doctors WHERE classification IS NOT NULL ORDER BY classification
```

But the business logic doc, implementation plan, and actual code all use:
```sql
... WHERE classification IS NOT NULL AND classification != '' ...
```

The `!= ''` clause is correct — the database contains empty-string classifications (test data confirms this with `Emptyclass` and `Bothempty` records). The architecture doc is wrong and should be fixed. If someone implements from the architecture doc alone, they'd return empty strings in the list.

### 2. The implementation plan doesn't mention `integration.test.ts`.

The plan lists 7 files to modify but misses `src/__tests__/integration.test.ts`, which asserts `toHaveLength(1)` for tool listing. This was caught at build time, but an implementation plan should identify *all* files that will break. A grep for `toHaveLength(1)` in test files or for `"doctor-search"` in assertions would have caught this.

### 3. `server.ts` routing uses if/else chain — fine for 2 tools, fragile for more.

The current routing is:
```typescript
if (toolName === "specialty-list") { ... }
if (toolName !== "doctor-search") { return unknown; }
// doctor-search logic
```

This works, but if a third tool is added, this pattern becomes error-prone (the `!== "doctor-search"` guard must become `else if`, or the unknown-tool fallback moves). The architecture doc doesn't note this as a known limitation or suggest a pattern for scaling (e.g., a handler map). Not a blocker for 2 tools, but worth a comment in the code or a note in the architecture doc.

### 4. No `callToolError` helper for specialty-list in acceptance tests.

The `doctor-search` acceptance tests have three helpers: `callTool`, `callToolSuccess`, `callToolError`. The specialty-list tests add `callSpecialtyList` and `callSpecialtyListSuccess` but not `callSpecialtyListError`. Test 26.9 (DB failure) manually asserts `isError` and extracts the text instead of using a helper. Inconsistent with the established pattern. Minor, but in a 141-test file, consistency matters for maintainability.

### 5. No test for `listSpecialties` on an empty database.

Section 24 tests `doctor-search` against an empty database (0 rows). There's no equivalent for `specialty-list`. The expected behavior is clear (return `{ specialties: [] }`), but it should be tested explicitly. An empty array vs. an error is a meaningful behavioral distinction.

### 6. The `SpecialtyListResult` type is arguably unnecessary.

The type is:
```typescript
export interface SpecialtyListResult {
  specialties: string[];
}
```

This wraps a single field. The existing codebase uses typed interfaces consistently (`SearchResult`, `DoctorRecord`), so it follows convention — but unlike those types, `SpecialtyListResult` carries no structural complexity. A return type of `string[]` at the function level, with the wrapping done in `server.ts` when building the JSON response, would be simpler and keep the output format decision in the server layer (where all other response formatting lives). Not wrong as-is, but worth noting that it couples `search.ts` to the response shape.

### 7. Sorting relies on SQLite's `ORDER BY` for ASCII text.

The SQL uses `ORDER BY classification` without `COLLATE NOCASE`. SQLite's default collation is binary, which means uppercase sorts before lowercase (`"Anesthesiology"` before `"cardiology"`). In practice this works because all classifications in the data are title-cased, but the docs don't call out this assumption. If a classification like `"nurse Practitioner"` (lowercase) existed, it would sort after all uppercase entries. The `doctor-search` queries use `COLLATE NOCASE` explicitly — `listSpecialties` should document why it doesn't, or add it for safety.

### 8. The `as` type assertion on query results is unchecked.

```typescript
.all() as { classification: string }[];
```

This is consistent with `searchDoctors` (which does the same for `RawRow[]`), so it's not a new problem. But `listSpecialties` doesn't have a named interface for its raw row shape like `searchDoctors` has `RawRow`. For a single-column query this is fine, but it's a minor consistency gap.

---

## Minor observations

- The implementation plan specifies line numbers for edits (e.g., "after line 124", "line 19"). These are useful for first-time execution but become stale immediately. Future readers of the plan should treat them as approximate.
- The acceptance test for 26.7 (unexpected arguments) tests behavior that depends on the MCP SDK version, not our code. If the SDK changes how it handles `additionalProperties`, this test could flip between passing-as-error and passing-as-success. Consider pinning the expected behavior with a comment explaining which SDK behavior we observed.
- The business logic doc still says "No changes to `index.ts` or `db.ts`" in the scope section, but the original text said "No changes to `server.ts`, `index.ts`, `db.ts`, or `types.ts`" — the update correctly removed `server.ts` and `types.ts` but didn't note that these *do* change. The phrasing is correct by omission, but a positive statement ("Changes required in `server.ts` and `types.ts`") would be clearer.

---

## Recommendation

Issue 1 (SQL mismatch) is a bug in the architecture doc — fix it. Issue 2 (missed test file) is a process gap worth noting for future plans. Issue 5 (empty DB test) is a missing test case that should be added. The rest are minor consistency and maintainability items that don't block shipping.
