# README.md and AGENTS.md Critique

## README.md Critique

**What's good:**
- Clean structure, scannable, appropriate for an external audience
- Quick Start is genuinely quick — Docker-only prerequisite is a strength
- Tool interface table is clear and useful
- Example request/response pairs are practical

**Issues:**

1. **No implementation status.** The README reads as if the server is fully functional. A user who builds and runs the image will get a server that prints a log line and does nothing. This needs at minimum a "Status: work in progress" banner or a note that the tool handler is not yet wired up.

2. **The "Run the server" command is misleading.** `docker run -i --rm doctor-search-mcp` will start a process that prints "doctor-search-mcp server starting" and exits (or hangs). It won't actually serve MCP requests. Same issue with the client configuration block — it suggests a working integration that doesn't exist yet.

3. **The Docker build will fail.** The Dockerfile runs `npm test` during build. The tests pass today, but once you implement the server modules and add tests for them, you should verify the build still works. More importantly, if someone tries `docker build` right now with the stubs, it works — but the resulting image is non-functional. That's a confusing user experience.

4. **Missing "What's not here" section.** No mention of limitations — no state-level filter, no first-name search, no pagination beyond the 50-record cap. For a README, setting expectations about scope is useful.

5. **No license or contributing info.** Minor, but standard README sections.

---

## AGENTS.md Critique

**What's good:**
- Excellent for its purpose (guiding an AI agent through the codebase)
- Implementation Status section with Clear/Stubbed split is exactly what's needed
- Module responsibilities table is concise and accurate
- Conventions section prevents common mistakes (`.js` extensions, parameterized queries, file headers)
- The data flow diagram `MCP Client -> stdio -> index.ts -> server.ts -> validate.ts -> search.ts -> db.ts -> SQLite` is very helpful

**Issues:**

1. **Repository structure lists files that don't exist yet in meaningful form.** The tree shows `index.ts` as "Entry point: open DB, start server, stdio transport" — that's aspirational, not actual. The file currently just logs a string. Consider annotating stubbed files (e.g., `# [stub]`) in the tree so an agent doesn't assume it can read working code there.

2. **MCP Client Configuration is under "Build & Run" — wrong section.** It's a subsection (`###`) nested under Build & Run, but it's really about client-side setup, not building or running the server. Should be its own `##` section or moved elsewhere.

3. **No mention of the `data/__tests__/` test files by name.** The `src/__tests__/` directory is listed but `data/__tests__/` tests (parse-values.test.ts, import-integration.test.ts) aren't enumerated. An agent implementing new tests won't know what patterns to follow without reading them.

4. **"Stubbed" section doesn't specify function signatures.** For `search.ts`, it says "needs: dynamic WHERE clause builder..." but doesn't mention that `searchDoctors()` already exists as a stub returning `{ total_count: 0, doctors: [] }`. Same for `validate.ts` — `validateInput()` exists and returns `null`. An agent should know it's filling in existing function bodies, not creating new exports.

5. **No error handling conventions.** The conventions section covers SQL safety and read-only DB, but doesn't specify how errors should flow. Should validation errors throw? Return error objects? The spec docs define this (`isError: true` MCP responses), but an agent reading only AGENTS.md won't know the pattern.

6. **The docs table is duplicated between README.md and AGENTS.md.** If one gets updated and the other doesn't, they'll drift. Consider having AGENTS.md reference the README table rather than maintaining a copy.

7. **No mention of the conversation/critique doc variants.** The `docs/` folder contains 24 files (7 core + 17 conversation/critique variants), but only the 7 core docs are listed. An agent exploring the docs folder will encounter unexpected files. A note like "additional `*-conversation.md` and `*-critique.md` files contain design discussion history" would help.

8. **Database schema doesn't mention column collation or case behavior.** The schema shows `last_name TEXT` but doesn't note that SQLite's `LIKE` is case-insensitive for ASCII by default, which is load-bearing for the prefix matching described in the tool interface. An agent implementing `search.ts` needs to know this.

---

## Cross-File Issues

1. **Duplicated content.** The tool interface, MCP client config, docs table, build commands, and architecture info all appear in both files. This creates a maintenance burden. README should serve external users; AGENTS.md should serve AI agents. Currently there's ~60% overlap.

2. **Neither file mentions the `tsx` dependency.** The import and verify scripts run via `tsx` (TypeScript execution without compilation), which is a dev dependency. This is a useful detail for an agent that needs to run or modify the import pipeline.
