/**
 * src/__tests__/integration.test.ts — End-to-End Integration Test
 *
 * Verifies the full wiring: DB → server → transport → client round-trip.
 * Uses an in-memory SQLite database with test data and real (unmocked)
 * validate, search, and server modules.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Server as HttpServer } from "node:http";

let testDb: DatabaseType;

// Mock db.ts so getDb() returns our in-memory test database
vi.mock("../db.js", () => ({
  getDb: () => testDb,
}));

const { createServer } = await import("../server.js");
const { startHttpServer } = await import("../http.js");

const TEST_DATA = [
  ["1000000001", "Smith", "John", "Internal Medicine", "Cardiovascular Disease", "M", "100 Main St", "Los Angeles", "90210", "3105551001"],
  ["1000000002", "Johnson", "Emily", "Cardiology", "Interventional Cardiology", "F", "400 Pine Rd", "New York", "10001", "2125551004"],
];

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
for (const row of TEST_DATA) {
  insert.run(...row);
}

afterAll(() => {
  testDb?.close();
});

describe("integration", () => {
  let server: Server;
  let client: Client;

  beforeAll(async () => {
    server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it("lists the doctor-search and specialty-list tools", async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(2);
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("doctor-search");
    expect(names).toContain("specialty-list");
  });

  it("returns search results for a valid query", async () => {
    const result = await client.callTool({
      name: "doctor-search",
      arguments: { lastname: "Smith" },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text
    );
    expect(parsed.total_count).toBe(1);
    expect(parsed.doctors[0].npi).toBe("1000000001");
    expect(parsed.doctors[0].lastname).toBe("Smith");
  });

  it("returns validation error for invalid input", async () => {
    const result = await client.callTool({
      name: "doctor-search",
      arguments: { gender: "female" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toBe(
      "At least 'lastname' or 'specialty' must be included as a filter."
    );
  });

  it("specialty prefix searches both classification and specialization", async () => {
    const result = await client.callTool({
      name: "doctor-search",
      arguments: { specialty: "Cardio" },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text
    );
    expect(parsed.total_count).toBe(2);
    const npis = parsed.doctors.map((d: { npi: string }) => d.npi);
    expect(npis).toContain("1000000001");
    expect(npis).toContain("1000000002");
  });

  it("combines multiple filters with AND logic", async () => {
    const result = await client.callTool({
      name: "doctor-search",
      arguments: { specialty: "Cardio", gender: "male" },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text
    );
    expect(parsed.total_count).toBe(1);
    expect(parsed.doctors[0].npi).toBe("1000000001");
  });
});

const HTTP_PORT = 49152 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${HTTP_PORT}`;

const INIT_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  },
};

const MCP_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/event-stream",
};

async function initSession(): Promise<string> {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify(INIT_BODY),
  });
  const sessionId = res.headers.get("mcp-session-id")!;
  await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { ...MCP_HEADERS, "mcp-session-id": sessionId },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return sessionId;
}

async function httpToolCall(sessionId: string, name: string, args: Record<string, unknown>, id = 2) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { ...MCP_HEADERS, "mcp-session-id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return res.json();
}

describe("HTTP integration", () => {
  let httpServer: HttpServer;

  beforeAll(async () => {
    httpServer = startHttpServer(HTTP_PORT);
    await new Promise<void>((resolve) => httpServer.on("listening", resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("HTTP search returns same results as InMemoryTransport search", async () => {
    const sessionId = await initSession();
    const httpBody = await httpToolCall(sessionId, "doctor-search", { lastname: "Smith" });
    const httpResult = JSON.parse(httpBody.result.content[0].text);

    const memServer = createServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await memServer.connect(st);
    const memClient = new Client({ name: "cmp", version: "1.0.0" });
    await memClient.connect(ct);

    const memRaw = await memClient.callTool({
      name: "doctor-search",
      arguments: { lastname: "Smith" },
    });
    const memResult = JSON.parse(
      (memRaw.content as Array<{ type: string; text: string }>)[0].text,
    );

    expect(httpResult.total_count).toBe(memResult.total_count);
    expect(httpResult.doctors).toEqual(memResult.doctors);

    await memClient.close();
    await memServer.close();
  });

  it("multiple HTTP sessions share the same database", async () => {
    const s1 = await initSession();
    const s2 = await initSession();

    const body1 = await httpToolCall(s1, "doctor-search", { lastname: "Smith" }, 10);
    const body2 = await httpToolCall(s2, "doctor-search", { lastname: "Smith" }, 11);

    const r1 = JSON.parse(body1.result.content[0].text);
    const r2 = JSON.parse(body2.result.content[0].text);

    expect(r1.total_count).toBe(r2.total_count);
    expect(r1.doctors).toEqual(r2.doctors);
  });
});
