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

let testDb: DatabaseType;

// Mock db.ts so getDb() returns our in-memory test database
vi.mock("../db.js", () => ({
  getDb: () => testDb,
}));

const { createServer } = await import("../server.js");

const TEST_DATA = [
  ["1000000001", "Smith", "John", "Internal Medicine", "Cardiovascular Disease", "M", "100 Main St", "Los Angeles", "90210", "3105551001"],
  ["1000000002", "Johnson", "Emily", "Cardiology", "Interventional Cardiology", "F", "400 Pine Rd", "New York", "10001", "2125551004"],
];

describe("integration", () => {
  let server: Server;
  let client: Client;

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
    for (const row of TEST_DATA) {
      insert.run(...row);
    }

    server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    testDb?.close();
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
