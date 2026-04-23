/**
 * src/__tests__/http.test.ts — HTTP Transport Tests
 *
 * Verifies the Streamable HTTP transport: session lifecycle,
 * tool calls over HTTP, and error handling for invalid requests.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import type { Server as HttpServer } from "node:http";

let testDb: DatabaseType;

vi.mock("../db.js", () => ({
  getDb: () => testDb,
}));

const { startHttpServer } = await import("../http.js");

const TEST_PORT = 49152 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://localhost:${TEST_PORT}`;

const INITIALIZE_REQUEST = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  },
};

async function postMcp(body: unknown, sessionId?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("HTTP transport", () => {
  let httpServer: HttpServer;

  beforeAll(async () => {
    testDb = new Database(":memory:");
    testDb.exec(`
      CREATE TABLE doctors (
        npi            TEXT PRIMARY KEY,
        last_name      TEXT NOT NULL,
        first_name     TEXT NOT NULL,
        classification TEXT,
        specialization TEXT,
        gender         TEXT,
        address        TEXT,
        city           TEXT,
        zipcode        TEXT,
        phone          TEXT
      );
      CREATE INDEX idx_last_name ON doctors(last_name);
      CREATE INDEX idx_classification ON doctors(classification);
      CREATE INDEX idx_specialization ON doctors(specialization);
      CREATE INDEX idx_gender ON doctors(gender);
      CREATE INDEX idx_zipcode ON doctors(zipcode);
    `);
    const insert = testDb.prepare(
      "INSERT INTO doctors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insert.run("1000000001", "Smith", "John", "Internal Medicine", "Cardiovascular Disease", "M", "100 Main St", "Los Angeles", "90210", "3105551001");
    insert.run("1000000002", "Johnson", "Emily", "Cardiology", "Interventional Cardiology", "F", "400 Pine Rd", "New York", "10001", "2125551004");

    httpServer = startHttpServer(TEST_PORT);
    await new Promise<void>((resolve) => {
      httpServer.on("listening", resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    testDb?.close();
  });

  it("returns 404 for non-/mcp paths", async () => {
    const res = await fetch(`${BASE_URL}/other`);
    expect(res.status).toBe(404);
  });

  it("returns 405 for unsupported HTTP methods", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, { method: "PUT" });
    expect(res.status).toBe(405);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain("Parse error");
  });

  it("returns 400 for POST without session ID and non-initialize request", async () => {
    const res = await postMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(400);
  });

  async function initSession(): Promise<string> {
    const res = await postMcp(INITIALIZE_REQUEST);
    const sessionId = res.headers.get("mcp-session-id")!;
    await postMcp(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      sessionId,
    );
    return sessionId;
  }

  it("creates a session on initialize and returns session ID", async () => {
    const res = await postMcp(INITIALIZE_REQUEST);
    expect(res.status).toBe(200);
    const sessionId = res.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
  });

  it("tool call within session returns results", async () => {
    const sessionId = await initSession();

    const toolRes = await postMcp(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "doctor-search", arguments: { lastname: "Smith" } },
      },
      sessionId,
    );
    expect(toolRes.status).toBe(200);
    const toolBody = await toolRes.json();
    const content = toolBody.result.content[0].text;
    const parsed = JSON.parse(content);
    expect(parsed.total_count).toBe(1);
    expect(parsed.doctors[0].lastname).toBe("Smith");
  });

  it("specialty-list tool works over HTTP", async () => {
    const sessionId = await initSession();

    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "specialty-list", arguments: {} },
      },
      sessionId,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = JSON.parse(body.result.content[0].text);
    expect(Array.isArray(parsed.specialties)).toBe(true);
    expect(parsed.specialties.length).toBeGreaterThan(0);
    const sorted = [...parsed.specialties].sort();
    expect(parsed.specialties).toEqual(sorted);
  });

  it("validation errors returned over HTTP", async () => {
    const sessionId = await initSession();

    const res = await postMcp(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "doctor-search", arguments: {} },
      },
      sessionId,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toBe("At least one filter is required.");
  });

  it("DELETE terminates session", async () => {
    const sessionId = await initSession();

    const delRes = await fetch(`${BASE_URL}/mcp`, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId },
    });
    expect(delRes.status).toBe(200);
  });

  it("multiple independent sessions", async () => {
    const session1 = await initSession();
    const session2 = await initSession();

    expect(session1).not.toBe(session2);

    const res1 = await postMcp(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "doctor-search", arguments: { lastname: "Smith" } },
      },
      session1,
    );
    const res2 = await postMcp(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "doctor-search", arguments: { lastname: "Johnson" } },
      },
      session2,
    );

    const body1 = await res1.json();
    const body2 = await res2.json();
    const parsed1 = JSON.parse(body1.result.content[0].text);
    const parsed2 = JSON.parse(body2.result.content[0].text);
    expect(parsed1.doctors[0].lastname).toBe("Smith");
    expect(parsed2.doctors[0].lastname).toBe("Johnson");
  });
});
