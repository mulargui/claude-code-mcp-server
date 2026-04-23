# Doctor Search MCP Server — HTTP Transport Documentation Critique

## Context

Product management review of the documentation changes made to support the HTTP transport feature (v1.2.0). The feature adds Streamable HTTP transport alongside the existing stdio transport, both active simultaneously.

---

## 1. The `$PORT` notation is broken for users

This is the biggest problem across the docs. The docker run commands show:
```
docker run -p $PORT:$PORT --rm doctor-search-mcp
```

A user copying this will get an error unless they happen to have `PORT` set in their shell. And the HTTP client config:
```json
"url": "http://localhost:${PORT}/mcp"
```
...is not valid JSON. Nobody can paste this into their MCP client config.

**Affected files**: architecture doc, infrastructure doc, AGENTS.md

**What it should be**: Show literal `3000` in the examples with a parenthetical "(or the value of `PORT` if overridden)". The env var table already defines the default — the examples should just work when copied.

## 2. `EXPOSE $PORT` in docs doesn't match the actual Dockerfile

The architecture and infrastructure docs say `EXPOSE $PORT`, but the actual Dockerfile has `EXPOSE 3000`. Dockerfiles don't resolve environment variables in `EXPOSE` unless you use `ARG`. The docs describe something that isn't what was built.

## 3. The spec doc shouldn't mention transport

The spec (`doctor-search-mcp-spec.md`) is the *functional* specification — what the tools do, not how they're delivered. The sentence tacked onto the overview ("The server supports dual transport...") is an implementation detail. The spec was transport-agnostic before; it should stay that way. Transport belongs in the interface and architecture docs, which is where it was also added.

## 4. No "why" for the feature

None of the docs explain *why* HTTP transport was added. The spec doc has a strong "Why?" section explaining the choice of MCP over A2A — but there's no equivalent rationale for adding HTTP alongside stdio. What use cases does it unlock? Remote MCP clients? Multi-client access? Cloud deployment? The motivation should be documented so future readers understand the intent, not just the mechanism.

## 5. Security implications not addressed

Adding HTTP transport turns a subprocess tool into a network service. None of the docs address:
- Is the server intended to be exposed to the internet, or only localhost/internal networks?
- No authentication — anyone who can reach the port can use the tools
- No TLS — traffic is unencrypted
- No rate limiting or connection limits

Even if the answer is "this is out of scope for v1.2.0," that should be stated explicitly so users don't accidentally expose a doctor database to the public internet.

## 6. Acceptance tests overview is stale

The overview of `doctor-search-mcp-acceptance-tests.md` still says:

> "These tests validate the server's behavior as observed by an MCP client over stdio transport."

But section 27 tests HTTP transport. The overview should reflect the full scope.

## 7. No session lifecycle documentation

The HTTP transport creates server instances per session but the docs don't address:
- What happens to sessions if a client disconnects without sending `DELETE`?
- Is there a session timeout?
- Is there a max concurrent sessions limit?
- Memory implications of orphaned sessions

This is an operational concern that users deploying the HTTP transport will need to understand.

## 8. Test count inconsistency

The acceptance test spec says 151 tests. The acceptance test *implementation* doc says 151. But the actual code has 141 in `acceptance.test.ts` + 10 in `http.test.ts` = 151. Meanwhile `acceptance.test.ts`'s JSDoc header says "All 141 tests" — which is correct for that file but could confuse someone reading the 151 number in the spec and looking for them all in one place. The implementation doc explains the split, but it could be clearer.

## 9. Architecture doc has a stale project structure tree

The project structure tree in the architecture doc (`docs/doctor-search-mcp-architecture.md`) still shows the original file layout without `http.ts`. Only AGENTS.md was updated with the new file. These should be consistent.

## Summary

The *mechanics* of the HTTP transport are well-documented across the interface, architecture, and infrastructure docs. The gaps are mostly about user-facing concerns: examples that actually work when pasted, security guidance, operational considerations, and keeping the spec doc at the right level of abstraction. The test documentation is solid but has minor inconsistencies in framing.
