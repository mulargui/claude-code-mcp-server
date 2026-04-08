# Doctor Search MCP Server — Testing Critique

## What's Well Done

- **Parser tests** are solid — good edge case coverage (escaped quotes, NULLs, embedded commas, `\r\n` stripping, short tuples).
- **Integration tests** are self-contained with synthetic data — no dependency on production dumps. Clean teardown with `afterEach`.
- **DB module tests** properly use `vi.resetModules()` to isolate singleton state.

## Gaps and Issues

### 1. Missing `openDb()` + `getDb()` Happy Path (db.test.ts)

The testing plan lists "`openDb()` + `getDb()` returns a database instance" and "Double `openDb()` is idempotent" as planned test cases, but neither was implemented. Only failure/edge cases of the db module are tested — never that it actually works. This is the most important path.

### 2. No Tests for `validate.ts` (Stub, but Contract is Fully Specified)

The interface doc defines 6 specific error messages and precise validation rules (min 3 chars, allowed characters, combination constraints). Even though `validate.ts` is a stub, the spec is locked down. Writing tests first (TDD-style) before implementing would catch spec mismatches early. These tests are the highest-value gap:
- No filters provided -> error
- Only gender -> error
- Only zipcode -> error
- Only gender+zipcode -> error
- `lastname` too short (1-2 chars) -> error
- `lastname` with digits or special chars -> error
- `specialty` too short -> error
- `gender` invalid value (e.g. "other") -> error
- `zipcode` not 5 digits -> error
- Valid combinations pass (lastname only, specialty only, all four)

### 3. No Tests for `search.ts` (Stub, but Query Logic is Spec'd)

The spec defines prefix matching behavior on `lastname` and `specialty` (against both `classification` and `specialization`), exact match on `gender`/`zipcode`, AND logic for combined filters, the 50-record cap, and `total_count` exceeding 50. Even as TDD stubs, tests here would lock down:
- Prefix match on lastname (`"Smi"` -> `"SMITH"`, `"SMITHSON"`)
- Prefix match on specialty searches both `classification` and `specialization`
- Case insensitivity (implied by prefix match on mixed-case data)
- Exact match on gender (normalized `M`/`F`)
- Exact match on zipcode
- AND logic with multiple filters
- Result cap at 50, `total_count` reflects true count
- The `specialty` output field logic: "longer of classification/specialization when both match"

### 4. No MCP Server/Transport Tests (server.ts, index.ts)

No tests verify the MCP protocol integration — tool listing, tool invocation, error response format (`isError: true`), or the text content block wrapping. This is where the spec meets the wire. Even a basic test that creates the server, calls `tools/list`, and calls `tools/call` with valid/invalid input would catch wiring bugs.

### 5. `import-integration.test.ts` Doesn't Test Multi-INSERT-Statement Dumps

The real dump has 21 `INSERT INTO` statements. The integration test only creates dumps with a single `INSERT` statement. If the line-reading logic in `import-logic.ts` has a bug handling the boundary between statements, tests won't catch it.

### 6. No Tests for `verify-data.ts`

The verification script has 4 checks (row count, lastname prefix, classification prefix, gender+zipcode combo). It exits with code 1 on failure. This is tested manually via Docker build but not in the test suite. A regression in the verification logic would go unnoticed.

### 7. No Negative/Boundary Tests for the Parser

- What happens with unterminated quotes? (e.g., `('abc`)
- Extremely long field values?
- Numeric (unquoted) fields other than NULL?
- Mixed NULL and quoted in same tuple?

### 8. Integration Test Doesn't Verify Empty Dump Handling

What happens when the dump has no `INSERT INTO npidata2` lines? Does it create an empty table, throw, or silently return `{totalParsed: 0}`? This is an edge case worth covering.

## Priority Ranking

| Priority | Gap | Rationale |
|----------|-----|-----------|
| **P0** | Validation tests (TDD) | Fully spec'd, 6 error messages, complex rules — highest regression risk when implemented |
| **P0** | Search tests (TDD) | Core business logic, prefix matching + cap + total_count — easy to get wrong |
| **P1** | MCP server integration test | The glue layer — validates tool listing, call routing, error format |
| **P1** | Missing db.test.ts happy path | The two most important test cases were planned but never written |
| **P2** | Multi-statement dump test | Real-world scenario not covered |
| **P2** | Parser boundary/negative cases | Defensive, but parser is already solid |
| **P3** | verify-data.ts tests | Low risk, runs in Docker build anyway |
| **P3** | Empty dump edge case | Minor edge case |

## Recommendation

Since `validate.ts` and `search.ts` are the next modules to implement, write their tests **now** (red tests that fail against the stubs), then implement the modules to make them pass. This locks in spec compliance and catches ambiguities before they become bugs. The MCP server integration test should follow immediately after `server.ts` is wired up.
