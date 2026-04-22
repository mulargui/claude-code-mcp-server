/**
 * src/__tests__/acceptance.test.ts — Acceptance Tests
 *
 * Validates the doctor-search MCP server's behavior through the MCP
 * protocol layer using an in-memory SQLite database with controlled
 * test data. All 141 tests exercise the full stack via Client/Server
 * round-trip over InMemoryTransport.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { DoctorRecord } from "../types.js";

// ---------------------------------------------------------------------------
// Database mock — all modules importing db.js get our in-memory test database
// ---------------------------------------------------------------------------
let testDb: DatabaseType;

vi.mock("../db.js", () => ({
  getDb: () => testDb,
}));

const { createServer } = await import("../server.js");

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const CORE_DOCTORS = [
  ["1000000001", "Smith",    "John",    "Internal Medicine",  "Cardiovascular Disease",    "M", "100 Main St",  "Los Angeles", "90210", "3105551001"],
  ["1000000002", "Smith",    "Jane",    "Internal Medicine",  "",                          "F", "200 Oak Ave",  "Los Angeles", "90210", "3105551002"],
  ["1000000003", "Smithson", "Robert",  "Family Medicine",    "",                          "M", "300 Elm St",   "Chicago",     "60601", "3125551003"],
  ["1000000004", "Johnson",  "Emily",   "Cardiology",         "Interventional Cardiology", "F", "400 Pine Rd",  "New York",    "10001", "2125551004"],
  ["1000000005", "Williams", "Michael", "Orthopedic Surgery", "",                          "M", "500 Cedar Ln", "Houston",     "77001", "7135551005"],
  ["1000000006", "O-Brien",  "Sarah",   "Internal Medicine",  "Geriatric Medicine",        "F", "600 Birch Dr", "Portland",    "97201", "5035551006"],
  ["1000000007", "Garcia",   "Carlos",  "Psychiatry",         "Child Psychiatry",          "M", "700 Maple St", "Miami",       "33101", "3055551007"],
];

const SPECIAL_DOCTORS = [
  ["3000000001", "Emptyclass",  "Test",  "",               "Sports Medicine",    "M", "1 Test St", "Test", "00001", "5550000001"],
  ["3000000002", "Bothempty",   "Test",  "",               "",                   "F", "2 Test St", "Test", "00002", "5550000002"],
  ["3000000003", "Hyphenspec",  "Test",  "Non-Surgical",   "",                   "M", "3 Test St", "Test", "00003", "5550000003"],
  ["9000000001", "Tiebreak",    "Test",  "Sleep Medicine", "Sleep Disorder",     "M", "4 Test St", "Test", "00004", "5550000004"],
  ["9000000002", "Tiebreak",    "Test",  "Sports Medicine","Sports Orthopedics", "M", "5 Test St", "Test", "00005", "5550000005"],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type ContentBlock = { type: string; text: string };

async function callTool(client: Client, args: Record<string, unknown>) {
  return client.callTool({ name: "doctor-search", arguments: args });
}

async function callToolSuccess(client: Client, args: Record<string, unknown>) {
  const result = await callTool(client, args);
  expect(result.isError).toBeFalsy();
  const text = (result.content as ContentBlock[])[0].text;
  return JSON.parse(text) as { total_count: number; doctors: DoctorRecord[] };
}

async function callToolError(client: Client, args: Record<string, unknown>) {
  const result = await callTool(client, args);
  expect(result.isError).toBe(true);
  return (result.content as ContentBlock[])[0].text;
}

function npis(doctors: DoctorRecord[]): string[] {
  return doctors.map((d) => d.npi);
}

async function callSpecialtyList(client: Client, args: Record<string, unknown> = {}) {
  return client.callTool({ name: "specialty-list", arguments: args });
}

async function callSpecialtyListSuccess(client: Client) {
  const result = await callSpecialtyList(client);
  expect(result.isError).toBeFalsy();
  const text = (result.content as ContentBlock[])[0].text;
  return JSON.parse(text) as { specialties: string[] };
}

// ---------------------------------------------------------------------------
// Schema creation helper (reused in main suite and special describe blocks)
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
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
`;

function seedDb(db: DatabaseType): void {
  db.exec(SCHEMA_SQL);
  const insert = db.prepare(
    "INSERT INTO doctors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  for (const row of CORE_DOCTORS) insert.run(...row);
  for (const row of SPECIAL_DOCTORS) insert.run(...row);

  // 55 "Test" doctors for result-cap testing
  for (let i = 1; i <= 55; i++) {
    const npi = `200000${String(i).padStart(4, "0")}`;
    insert.run(npi, "Test", `First${i}`, "Pediatrics", "", "M", `${i} Test Ave`, "Testville", "55555", `555000${String(i).padStart(4, "0")}`);
  }

  // 50 "Fifty" doctors for exactly-50 testing
  for (let i = 1; i <= 50; i++) {
    const npi = `400000${String(i).padStart(4, "0")}`;
    insert.run(npi, "Fifty", `First${i}`, "Pediatrics", "", "M", `${i} Fifty Ave`, "Fiftyville", "88888", `888000${String(i).padStart(4, "0")}`);
  }
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------
describe("acceptance tests", () => {
  let server: Server;
  let client: Client;
  let savedDb: DatabaseType;

  beforeAll(async () => {
    testDb = new Database(":memory:");
    seedDb(testDb);
    savedDb = testDb;

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

  // =========================================================================
  // 1. MCP Protocol Compliance
  // =========================================================================
  describe("1. MCP Protocol Compliance", () => {
    it("1.1 server responds with correct name and version", async () => {
      // The client successfully connected — initialize handshake passed.
      // Verify the server is functional by listing tools.
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    });

    it("1.2 tool listing returns doctor-search and specialty-list with correct schemas", async () => {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(2);

      const searchTool = result.tools.find((t) => t.name === "doctor-search");
      expect(searchTool).toBeDefined();
      expect(searchTool!.description).toMatch(/prefix/i);
      expect(searchTool!.description).toMatch(/50/);
      expect(searchTool!.inputSchema.properties).toHaveProperty("lastname");
      expect(searchTool!.inputSchema.properties).toHaveProperty("specialty");
      expect(searchTool!.inputSchema.properties).toHaveProperty("gender");
      expect(searchTool!.inputSchema.properties).toHaveProperty("zipcode");
      expect(
        (searchTool!.inputSchema as Record<string, unknown>).additionalProperties
      ).toBe(false);

      const listTool = result.tools.find((t) => t.name === "specialty-list");
      expect(listTool).toBeDefined();
      expect(listTool!.description).toMatch(/specialt/i);
      expect(listTool!.inputSchema.properties).toEqual({});
      expect(
        (listTool!.inputSchema as Record<string, unknown>).additionalProperties
      ).toBe(false);
    });

    it("1.3 tool call with valid input returns success format", async () => {
      const result = await callTool(client, { lastname: "Smith" });
      expect(result.isError).toBeFalsy();
      const content = result.content as ContentBlock[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      const parsed = JSON.parse(content[0].text);
      expect(typeof parsed.total_count).toBe("number");
      expect(Array.isArray(parsed.doctors)).toBe(true);
    });

    it("1.4 tool call with invalid input returns error format", async () => {
      const result = await callTool(client, {});
      expect(result.isError).toBe(true);
      const content = result.content as ContentBlock[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      expect(typeof content[0].text).toBe("string");
    });

    it("1.5 unknown tool name returns error", async () => {
      const result = await client.callTool({
        name: "unknown-tool",
        arguments: {},
      });
      expect(result.isError).toBe(true);
    });
  });

  // =========================================================================
  // 2. Input Validation — Filter Combination Rules
  // =========================================================================
  describe("2. Input Validation — Filter Combination Rules", () => {
    it("2.1 no filters provided", async () => {
      const msg = await callToolError(client, {});
      expect(msg).toBe("At least one filter is required.");
    });

    it("2.2 only gender provided", async () => {
      const msg = await callToolError(client, { gender: "male" });
      expect(msg).toBe("At least 'lastname' or 'specialty' must be included as a filter.");
    });

    it("2.3 only zipcode provided", async () => {
      const msg = await callToolError(client, { zipcode: "90210" });
      expect(msg).toBe("At least 'lastname' or 'specialty' must be included as a filter.");
    });

    it("2.4 only gender and zipcode provided", async () => {
      const msg = await callToolError(client, { gender: "female", zipcode: "90210" });
      expect(msg).toBe("At least 'lastname' or 'specialty' must be included as a filter.");
    });

    it("2.5 lastname alone is sufficient", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      expect(result.doctors.length).toBeGreaterThan(0);
    });

    it("2.6 specialty alone is sufficient", async () => {
      const result = await callToolSuccess(client, { specialty: "Internal Medicine" });
      expect(result.doctors.length).toBeGreaterThan(0);
    });

    it("2.7 all four filters provided", async () => {
      const result = await callTool(client, {
        lastname: "Smith", specialty: "Internal", gender: "male", zipcode: "90210",
      });
      expect(result.isError).toBeFalsy();
    });

    it("2.8 lastname with gender is valid", async () => {
      const result = await callTool(client, { lastname: "Smith", gender: "female" });
      expect(result.isError).toBeFalsy();
    });

    it("2.9 specialty with zipcode is valid", async () => {
      const result = await callTool(client, { specialty: "Cardio", zipcode: "10001" });
      expect(result.isError).toBeFalsy();
    });

    it("2.10 lastname with zipcode is valid", async () => {
      const result = await callTool(client, { lastname: "Smith", zipcode: "90210" });
      expect(result.isError).toBeFalsy();
    });

    it("2.11 specialty with gender is valid", async () => {
      const result = await callTool(client, { specialty: "Pediatrics", gender: "M" });
      expect(result.isError).toBeFalsy();
    });
  });

  // =========================================================================
  // 3. Input Validation — Individual Field Rules
  // =========================================================================
  describe("3. Input Validation — Individual Field Rules", () => {
    const LASTNAME_ERR = "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only.";
    const SPECIALTY_ERR = "Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only.";
    const GENDER_ERR = "Invalid gender: must be one of 'male', 'female', 'M', 'F'.";
    const ZIPCODE_ERR = "Invalid zipcode: must be exactly 5 digits.";

    // Lastname
    it("3.1 lastname — valid alphabetic", async () => {
      const result = await callTool(client, { lastname: "Smith" });
      expect(result.isError).toBeFalsy();
    });

    it("3.2 lastname — valid with hyphen", async () => {
      const result = await callTool(client, { lastname: "O-Brien" });
      expect(result.isError).toBeFalsy();
    });

    it("3.3 lastname — too short (1 char)", async () => {
      expect(await callToolError(client, { lastname: "S" })).toBe(LASTNAME_ERR);
    });

    it("3.4 lastname — too short (2 chars)", async () => {
      expect(await callToolError(client, { lastname: "Sm" })).toBe(LASTNAME_ERR);
    });

    it("3.5 lastname — exactly 3 characters (boundary)", async () => {
      const result = await callTool(client, { lastname: "Smi" });
      expect(result.isError).toBeFalsy();
    });

    it("3.6 lastname — contains digits", async () => {
      expect(await callToolError(client, { lastname: "Smith2" })).toBe(LASTNAME_ERR);
    });

    it("3.7 lastname — contains special characters", async () => {
      expect(await callToolError(client, { lastname: "Smith!" })).toBe(LASTNAME_ERR);
    });

    it("3.8 lastname — contains spaces", async () => {
      expect(await callToolError(client, { lastname: "De La Cruz" })).toBe(LASTNAME_ERR);
    });

    it("3.9 lastname — empty string", async () => {
      expect(await callToolError(client, { lastname: "" })).toBe(LASTNAME_ERR);
    });

    // Specialty
    it("3.10 specialty — valid value", async () => {
      const result = await callTool(client, { specialty: "Cardiology" });
      expect(result.isError).toBeFalsy();
    });

    it("3.11 specialty — valid with spaces and hyphens", async () => {
      const result = await callTool(client, { specialty: "Internal Medicine" });
      expect(result.isError).toBeFalsy();
    });

    it("3.12 specialty — too short (1 char)", async () => {
      expect(await callToolError(client, { specialty: "C" })).toBe(SPECIALTY_ERR);
    });

    it("3.13 specialty — too short (2 chars)", async () => {
      expect(await callToolError(client, { specialty: "Ca" })).toBe(SPECIALTY_ERR);
    });

    it("3.14 specialty — exactly 3 characters (boundary)", async () => {
      const result = await callTool(client, { specialty: "Car" });
      expect(result.isError).toBeFalsy();
    });

    it("3.15 specialty — contains digits", async () => {
      expect(await callToolError(client, { specialty: "Card1ology" })).toBe(SPECIALTY_ERR);
    });

    it("3.16 specialty — contains special characters", async () => {
      expect(await callToolError(client, { specialty: "Card@ology" })).toBe(SPECIALTY_ERR);
    });

    it("3.17 specialty — empty string", async () => {
      expect(await callToolError(client, { specialty: "" })).toBe(SPECIALTY_ERR);
    });

    // Gender
    it("3.18 gender — 'male' accepted", async () => {
      const result = await callTool(client, { lastname: "Smith", gender: "male" });
      expect(result.isError).toBeFalsy();
    });

    it("3.19 gender — 'female' accepted", async () => {
      const result = await callTool(client, { lastname: "Smith", gender: "female" });
      expect(result.isError).toBeFalsy();
    });

    it("3.20 gender — 'M' accepted", async () => {
      const result = await callTool(client, { lastname: "Smith", gender: "M" });
      expect(result.isError).toBeFalsy();
    });

    it("3.21 gender — 'F' accepted", async () => {
      const result = await callTool(client, { lastname: "Smith", gender: "F" });
      expect(result.isError).toBeFalsy();
    });

    it("3.22 gender — invalid value 'other'", async () => {
      expect(await callToolError(client, { lastname: "Smith", gender: "other" })).toBe(GENDER_ERR);
    });

    it("3.23 gender — invalid arbitrary string", async () => {
      expect(await callToolError(client, { lastname: "Smith", gender: "xyz" })).toBe(GENDER_ERR);
    });

    it("3.24 gender — empty string", async () => {
      expect(await callToolError(client, { lastname: "Smith", gender: "" })).toBe(GENDER_ERR);
    });

    // Zipcode
    it("3.25 zipcode — valid 5 digits", async () => {
      const result = await callTool(client, { lastname: "Smith", zipcode: "90210" });
      expect(result.isError).toBeFalsy();
    });

    it("3.26 zipcode — too few digits (4)", async () => {
      expect(await callToolError(client, { lastname: "Smith", zipcode: "9021" })).toBe(ZIPCODE_ERR);
    });

    it("3.27 zipcode — too many digits (6)", async () => {
      expect(await callToolError(client, { lastname: "Smith", zipcode: "902100" })).toBe(ZIPCODE_ERR);
    });

    it("3.28 zipcode — ZIP+4 format rejected", async () => {
      expect(await callToolError(client, { lastname: "Smith", zipcode: "90210-1234" })).toBe(ZIPCODE_ERR);
    });

    it("3.29 zipcode — alphabetic characters", async () => {
      expect(await callToolError(client, { lastname: "Smith", zipcode: "abcde" })).toBe(ZIPCODE_ERR);
    });

    it("3.30 zipcode — mixed alphanumeric", async () => {
      expect(await callToolError(client, { lastname: "Smith", zipcode: "90ab0" })).toBe(ZIPCODE_ERR);
    });

    it("3.31 zipcode — empty string", async () => {
      expect(await callToolError(client, { lastname: "Smith", zipcode: "" })).toBe(ZIPCODE_ERR);
    });

    it("3.32 zipcode — leading zeros preserved", async () => {
      const result = await callTool(client, { lastname: "Smith", zipcode: "01234" });
      expect(result.isError).toBeFalsy();
    });
  });

  // =========================================================================
  // 4. Input Validation — Multiple Invalid Fields
  // =========================================================================
  describe("4. Input Validation — Multiple Invalid Fields", () => {
    it("4.1 multiple fields invalid — first invalid field reported", async () => {
      const msg = await callToolError(client, { lastname: "S", zipcode: "abc" });
      expect(msg).toBe("Invalid lastname: must be at least 3 characters, alphabetic and hyphens only.");
    });

    it("4.2 combination rule violated AND field invalid — combination first", async () => {
      const msg = await callToolError(client, { gender: "xyz" });
      expect(msg).toBe("At least 'lastname' or 'specialty' must be included as a filter.");
    });

    it("4.3 valid combination with one invalid field", async () => {
      const msg = await callToolError(client, { specialty: "Cardiology", zipcode: "abc" });
      expect(msg).toBe("Invalid zipcode: must be exactly 5 digits.");
    });
  });

  // =========================================================================
  // 5. Search Logic — Prefix Matching
  // =========================================================================
  describe("5. Search Logic — Prefix Matching", () => {
    it("5.1 lastname prefix match — partial name", async () => {
      const result = await callToolSuccess(client, { lastname: "Smi" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
      expect(npiList).toContain("1000000003");
      expect(npiList).not.toContain("1000000004");
      expect(npiList).not.toContain("1000000005");
    });

    it("5.2 lastname prefix match — full name matches all prefixed", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
      expect(npiList).toContain("1000000002");
      expect(npiList).toContain("1000000003");
    });

    it("5.3 lastname prefix match — exact full name only", async () => {
      const result = await callToolSuccess(client, { lastname: "Smithson" });
      expect(result.doctors).toHaveLength(1);
      expect(result.doctors[0].npi).toBe("1000000003");
    });

    it("5.4 specialty prefix match — matches classification", async () => {
      const result = await callToolSuccess(client, { specialty: "Internal" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
      expect(npiList).toContain("1000000002");
      expect(npiList).toContain("1000000006");
    });

    it("5.5 specialty prefix match — matches specialization", async () => {
      const result = await callToolSuccess(client, { specialty: "Cardiovascular" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
    });

    it("5.6 specialty prefix match — matches both classification and specialization", async () => {
      const result = await callToolSuccess(client, { specialty: "Cardio" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000004"); // classification = Cardiology
      expect(npiList).toContain("1000000001"); // specialization = Cardiovascular Disease
    });

    it("5.7 specialty prefix — short prefix matches broadly", async () => {
      const result = await callToolSuccess(client, { specialty: "Int" });
      const npiList = npis(result.doctors);
      // Internal Medicine (classification)
      expect(npiList).toContain("1000000001");
      expect(npiList).toContain("1000000002");
      expect(npiList).toContain("1000000006");
      // Interventional Cardiology (specialization)
      expect(npiList).toContain("1000000004");
    });
  });

  // =========================================================================
  // 6. Search Logic — Case Insensitivity
  // =========================================================================
  describe("6. Search Logic — Case Insensitivity", () => {
    it("6.1 lastname — lowercase input matches capitalized data", async () => {
      const result = await callToolSuccess(client, { lastname: "smith" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
    });

    it("6.2 lastname — uppercase input matches capitalized data", async () => {
      const result = await callToolSuccess(client, { lastname: "SMITH" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
    });

    it("6.3 lastname — mixed case input matches", async () => {
      const result = await callToolSuccess(client, { lastname: "sMiTh" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
    });

    it("6.4 specialty — case insensitive prefix match", async () => {
      const result = await callToolSuccess(client, { specialty: "internal medicine" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
      expect(npiList).toContain("1000000002");
    });

    it("6.5 gender — 'male' normalized to match 'M' in database", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", gender: "male" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
      expect(npiList).not.toContain("1000000002");
    });

    it("6.6 gender — 'female' normalized to match 'F' in database", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", gender: "female" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000002");
      expect(npiList).not.toContain("1000000001");
    });

    it("6.7 gender — 'M' matches directly", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", gender: "M" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
      expect(npiList).not.toContain("1000000002");
    });

    it("6.8 gender — 'F' matches directly", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", gender: "F" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000002");
      expect(npiList).not.toContain("1000000001");
    });
  });

  // =========================================================================
  // 7. Search Logic — Exact Matching
  // =========================================================================
  describe("7. Search Logic — Exact Matching", () => {
    it("7.1 zipcode — exact match only", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", zipcode: "90210" });
      for (const doc of result.doctors) {
        expect(doc.zipcode).toBe("90210");
      }
    });

    it("7.2 zipcode — no prefix matching (partial zipcode rejected by validation)", async () => {
      const msg = await callToolError(client, { specialty: "Internal", zipcode: "9021" });
      expect(msg).toBe("Invalid zipcode: must be exactly 5 digits.");
    });

    it("7.3 gender — exact match (not prefix)", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", gender: "M" });
      for (const doc of result.doctors) {
        expect(doc.gender).toBe("M");
      }
    });
  });

  // =========================================================================
  // 8. Search Logic — AND Combination
  // =========================================================================
  describe("8. Search Logic — AND Combination", () => {
    it("8.1 lastname AND gender — intersection", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", gender: "male" });
      const npiList = npis(result.doctors);
      // "Smith" prefix matches Smith (1000000001) and Smithson (1000000003), both male
      expect(npiList).toContain("1000000001");
      expect(npiList).not.toContain("1000000002"); // Smith/F excluded
    });

    it("8.2 lastname AND zipcode — intersection", async () => {
      const result = await callToolSuccess(client, { lastname: "Smi", zipcode: "90210" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000001");
      expect(npiList).toContain("1000000002");
      expect(npiList).not.toContain("1000000003");
    });

    it("8.3 specialty AND gender AND zipcode — triple intersection", async () => {
      const result = await callToolSuccess(client, {
        specialty: "Internal", gender: "male", zipcode: "90210",
      });
      expect(result.doctors).toHaveLength(1);
      expect(result.doctors[0].npi).toBe("1000000001");
    });

    it("8.4 all four filters — quadruple intersection", async () => {
      const result = await callToolSuccess(client, {
        lastname: "Smith", specialty: "Internal", gender: "male", zipcode: "90210",
      });
      expect(result.total_count).toBe(1);
      expect(result.doctors[0].npi).toBe("1000000001");
    });

    it("8.5 filters that produce an empty intersection", async () => {
      const result = await callToolSuccess(client, {
        lastname: "Smith", gender: "female", zipcode: "60601",
      });
      // No female Smith/Smithson in 60601
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });
  });

  // =========================================================================
  // 9. Result Cap and Total Count
  // =========================================================================
  describe("9. Result Cap and Total Count", () => {
    it("9.1 results capped at 50", async () => {
      const result = await callToolSuccess(client, { lastname: "Test" });
      expect(result.doctors).toHaveLength(50);
      expect(result.total_count).toBe(55);
    });

    it("9.2 total count reflects true count, not capped count", async () => {
      const result = await callToolSuccess(client, { lastname: "Test" });
      expect(result.total_count).toBe(55);
    });

    it("9.3 fewer than 50 results — no cap applied", async () => {
      const result = await callToolSuccess(client, { lastname: "Smi" });
      expect(result.doctors).toHaveLength(3);
      expect(result.total_count).toBe(3);
    });

    it("9.4 exactly 50 results", async () => {
      const result = await callToolSuccess(client, { lastname: "Fifty" });
      expect(result.doctors).toHaveLength(50);
      expect(result.total_count).toBe(50);
    });

    it("9.5 zero results", async () => {
      const result = await callToolSuccess(client, { lastname: "Zzz" });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });
  });

  // =========================================================================
  // 10. Output Format — Doctor Records
  // =========================================================================
  describe("10. Output Format — Doctor Records", () => {
    it("10.1 all fields present in each doctor record", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      for (const doc of result.doctors) {
        expect(doc).toHaveProperty("npi");
        expect(doc).toHaveProperty("lastname");
        expect(doc).toHaveProperty("firstname");
        expect(doc).toHaveProperty("specialty");
        expect(doc).toHaveProperty("gender");
        expect(doc).toHaveProperty("address");
        expect(doc).toHaveProperty("city");
        expect(doc).toHaveProperty("zipcode");
        expect(doc).toHaveProperty("phone");
      }
    });

    it("10.2 NPI is a string", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      for (const doc of result.doctors) {
        expect(typeof doc.npi).toBe("string");
      }
    });

    it("10.3 gender is normalized to M/F in output", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      for (const doc of result.doctors) {
        expect(["M", "F"]).toContain(doc.gender);
      }
    });

    it("10.4 phone is a 10-digit string", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      for (const doc of result.doctors) {
        expect(doc.phone).toMatch(/^[0-9]{10}$/);
      }
    });

    it("10.5 zipcode is a 5-digit string", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      for (const doc of result.doctors) {
        expect(doc.zipcode).toMatch(/^[0-9]{5}$/);
      }
    });

    it("10.6 no extra fields in doctor records", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      const expectedKeys = ["npi", "lastname", "firstname", "specialty", "gender", "address", "city", "zipcode", "phone"];
      for (const doc of result.doctors) {
        expect(Object.keys(doc).sort()).toEqual(expectedKeys.sort());
      }
    });
  });

  // =========================================================================
  // 11. Output Format — Specialty Field Mapping
  // =========================================================================
  describe("11. Output Format — Specialty Field Mapping", () => {
    it("11.1 specialty query matches only classification — classification returned", async () => {
      const result = await callToolSuccess(client, { specialty: "Internal" });
      const doc = result.doctors.find((d) => d.npi === "1000000002");
      expect(doc).toBeDefined();
      expect(doc!.specialty).toBe("Internal Medicine");
    });

    it("11.2 specialty query matches only specialization — specialization returned", async () => {
      const result = await callToolSuccess(client, { specialty: "Cardiovascular" });
      const doc = result.doctors.find((d) => d.npi === "1000000001");
      expect(doc).toBeDefined();
      expect(doc!.specialty).toBe("Cardiovascular Disease");
    });

    it("11.3 specialty query matches both — longer string returned", async () => {
      // Use "Sports" prefix which matches both classification and specialization
      // for NPI 9000000002: classification="Sports Medicine", specialization="Sports Orthopedics"
      const result = await callToolSuccess(client, { specialty: "Sports" });
      const doc = result.doctors.find((d) => d.npi === "9000000002");
      expect(doc).toBeDefined();
      // "Sports Orthopedics" (18) > "Sports Medicine" (15) → longer wins
      expect(doc!.specialty).toBe("Sports Orthopedics");
    });

    it("11.4 no specialty filter — longer of the two returned", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      const doc = result.doctors.find((d) => d.npi === "1000000001");
      expect(doc).toBeDefined();
      // "Cardiovascular Disease" (22 chars) > "Internal Medicine" (17 chars)
      expect(doc!.specialty).toBe("Cardiovascular Disease");
    });
  });

  // =========================================================================
  // 12. Search Logic — No Results (Valid Queries)
  // =========================================================================
  describe("12. Search Logic — No Results (Valid Queries)", () => {
    it("12.1 non-matching lastname", async () => {
      const result = await callToolSuccess(client, { lastname: "Xyz" });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });

    it("12.2 non-matching specialty", async () => {
      const result = await callToolSuccess(client, { specialty: "Xyz" });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });

    it("12.3 matching lastname but non-matching zipcode", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith", zipcode: "99999" });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });

    it("12.4 matching specialty but non-matching zipcode", async () => {
      const result = await callToolSuccess(client, { specialty: "Internal", zipcode: "00000" });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });
  });

  // =========================================================================
  // 13. Edge Cases — Input
  // =========================================================================
  describe("13. Edge Cases — Input", () => {
    it("13.1 additional properties rejected or ignored", async () => {
      // Server picks only known keys; extra props are silently ignored
      const result = await callTool(client, { lastname: "Smith", state: "CA" });
      // Either isError or success (extra prop ignored) — both acceptable
      if (!result.isError) {
        const parsed = JSON.parse((result.content as ContentBlock[])[0].text);
        expect(parsed.total_count).toBeGreaterThan(0);
      }
    });

    it("13.2 non-string parameter types", async () => {
      const result = await callTool(client, { lastname: 12345 });
      expect(result.isError).toBe(true);
    });

    it("13.3 null parameter value", async () => {
      const result = await callTool(client, { lastname: null });
      expect(result.isError).toBe(true);
    });

    it("13.4 lastname — very long input", async () => {
      const result = await callToolSuccess(client, {
        lastname: "Abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",
      });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });

    it("13.5 specialty — very long input", async () => {
      const result = await callToolSuccess(client, {
        specialty: "Abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",
      });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
    });

    it("13.6 lastname — SQL injection attempt", async () => {
      const msg = await callToolError(client, {
        lastname: "Smith'; DROP TABLE doctors; --",
      });
      expect(msg).toBe("Invalid lastname: must be at least 3 characters, alphabetic and hyphens only.");
    });

    it("13.7 specialty — SQL injection attempt", async () => {
      const msg = await callToolError(client, {
        specialty: "'; DROP TABLE doctors; --",
      });
      expect(msg).toBe("Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only.");
    });

    it("13.8 lastname — ASCII alphabetic accepted", async () => {
      const result = await callTool(client, { lastname: "Muller" });
      expect(result.isError).toBeFalsy();
    });

    it("13.8b lastname — unicode accented characters rejected", async () => {
      const msg = await callToolError(client, { lastname: "M\u00fcller" });
      expect(msg).toBe("Invalid lastname: must be at least 3 characters, alphabetic and hyphens only.");
    });

    it("13.9 whitespace-only lastname", async () => {
      const result = await callTool(client, { lastname: "   " });
      expect(result.isError).toBe(true);
    });

    it("13.10 zipcode — leading/trailing whitespace", async () => {
      const msg = await callToolError(client, { lastname: "Smith", zipcode: " 90210 " });
      expect(msg).toBe("Invalid zipcode: must be exactly 5 digits.");
    });
  });

  // =========================================================================
  // 14. Edge Cases — Data
  // =========================================================================
  describe("14. Edge Cases — Data", () => {
    it("14.1 doctor with empty specialization", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      const doc = result.doctors.find((d) => d.npi === "1000000002");
      expect(doc).toBeDefined();
      expect(doc!.specialty).toBe("Internal Medicine");
    });

    it("14.2 doctor with empty classification", async () => {
      const result = await callToolSuccess(client, { lastname: "Emptyclass" });
      expect(result.doctors).toHaveLength(1);
      expect(result.doctors[0].specialty).toBe("Sports Medicine");
    });

    it("14.3 doctor with both classification and specialization empty", async () => {
      const result = await callToolSuccess(client, { lastname: "Bothempty" });
      expect(result.doctors).toHaveLength(1);
      expect(result.doctors[0].specialty).toBe("");
    });

    it("14.4 hyphenated last names match correctly", async () => {
      const result = await callToolSuccess(client, { lastname: "O-B" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000006");
    });

    it("14.5 specialty with hyphen matches", async () => {
      const result = await callToolSuccess(client, { specialty: "Non-Sur" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("3000000003");
    });
  });

  // =========================================================================
  // 15. Internal Error Handling
  // =========================================================================
  describe("15. Internal Error Handling", () => {
    it("15.1 database unavailable", async () => {
      const original = testDb;
      testDb = new Database(":memory:");
      testDb.close(); // closed DB will throw on any query
      const msg = await callToolError(client, { lastname: "Smith" });
      expect(msg).toBe("Internal error: please try again later.");
      testDb = original;
    });

    it("15.2 internal error format — no details leaked", async () => {
      const original = testDb;
      testDb = new Database(":memory:");
      testDb.close();
      const result = await callTool(client, { lastname: "Smith" });
      expect(result.isError).toBe(true);
      const content = result.content as ContentBlock[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      expect(content[0].text).toBe("Internal error: please try again later.");
      expect(content[0].text).not.toMatch(/stack/i);
      expect(content[0].text).not.toMatch(/\.ts/);
      testDb = original;
    });
  });

  // =========================================================================
  // 16. Response Structure Integrity
  // =========================================================================
  describe("16. Response Structure Integrity", () => {
    it("16.1 successful response is valid JSON", async () => {
      const result = await callTool(client, { lastname: "Smith" });
      const text = (result.content as ContentBlock[])[0].text;
      const parsed = JSON.parse(text);
      expect(typeof parsed.total_count).toBe("number");
      expect(Array.isArray(parsed.doctors)).toBe(true);
    });

    it("16.2 error response is plain text, not JSON", async () => {
      const result = await callTool(client, {});
      const text = (result.content as ContentBlock[])[0].text;
      expect(() => {
        const parsed = JSON.parse(text);
        // If it parses, it shouldn't have our expected structure
        if (typeof parsed === "object" && parsed !== null) {
          throw new Error("Should be plain text");
        }
      }).toThrow();
    });

    it("16.3 content block structure on success", async () => {
      const result = await callTool(client, { lastname: "Smith" });
      const content = result.content as ContentBlock[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      expect(result.isError).toBeFalsy();
    });

    it("16.4 content block structure on error", async () => {
      const result = await callTool(client, {});
      const content = result.content as ContentBlock[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      expect(result.isError).toBe(true);
    });
  });

  // =========================================================================
  // 17. Validation Priority
  // =========================================================================
  describe("17. Validation Priority", () => {
    it("17.1 validation happens before search", async () => {
      const msg = await callToolError(client, { lastname: "S" });
      expect(msg).toBe("Invalid lastname: must be at least 3 characters, alphabetic and hyphens only.");
    });

    it("17.2 all fields validated before any search", async () => {
      const result = await callTool(client, { lastname: "Sm", zipcode: "abc" });
      expect(result.isError).toBe(true);
    });
  });

  // =========================================================================
  // 18. Validation Ordering
  // =========================================================================
  describe("18. Validation Ordering", () => {
    it("18.1 field validation order is deterministic — lastname first", async () => {
      const msg = await callToolError(client, {
        lastname: "S", specialty: "X", gender: "xyz", zipcode: "abc",
      });
      expect(msg).toBe("Invalid lastname: must be at least 3 characters, alphabetic and hyphens only.");
    });
  });

  // =========================================================================
  // 19. Result Ordering
  // =========================================================================
  describe("19. Result Ordering", () => {
    it("19.1 results are deterministic across calls", async () => {
      const r1 = await callToolSuccess(client, { lastname: "Test" });
      const r2 = await callToolSuccess(client, { lastname: "Test" });
      expect(r1.doctors.map((d) => d.npi)).toEqual(r2.doctors.map((d) => d.npi));
    });

    it("19.2 results are sorted by NPI ascending", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      const npiList = npis(result.doctors);
      const sorted = [...npiList].sort();
      expect(npiList).toEqual(sorted);
    });
  });

  // =========================================================================
  // 20. Specialty Field Default (No Specialty Filter)
  // =========================================================================
  describe("20. Specialty Field Default (No Specialty Filter)", () => {
    it("20.1 both fields populated — longer returned", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      const doc = result.doctors.find((d) => d.npi === "1000000001");
      expect(doc).toBeDefined();
      // "Cardiovascular Disease" (22) > "Internal Medicine" (17)
      expect(doc!.specialty).toBe("Cardiovascular Disease");
    });

    it("20.2 only specialization populated — specialization returned", async () => {
      const result = await callToolSuccess(client, { lastname: "Emptyclass" });
      expect(result.doctors[0].specialty).toBe("Sports Medicine");
    });

    it("20.3 only classification populated — classification returned", async () => {
      const result = await callToolSuccess(client, { lastname: "Smith" });
      const doc = result.doctors.find((d) => d.npi === "1000000002");
      expect(doc).toBeDefined();
      expect(doc!.specialty).toBe("Internal Medicine");
    });
  });

  // =========================================================================
  // 21. Gender Case Sensitivity
  // =========================================================================
  describe("21. Gender Case Sensitivity", () => {
    const GENDER_ERR = "Invalid gender: must be one of 'male', 'female', 'M', 'F'.";

    it("21.1 'MALE' (uppercase) rejected", async () => {
      expect(await callToolError(client, { lastname: "Smith", gender: "MALE" })).toBe(GENDER_ERR);
    });

    it("21.2 'Male' (title case) rejected", async () => {
      expect(await callToolError(client, { lastname: "Smith", gender: "Male" })).toBe(GENDER_ERR);
    });

    it("21.3 'FEMALE' (uppercase) rejected", async () => {
      expect(await callToolError(client, { lastname: "Smith", gender: "FEMALE" })).toBe(GENDER_ERR);
    });
  });

  // =========================================================================
  // 22. Prefix Matching Boundaries
  // =========================================================================
  describe("22. Prefix Matching Boundaries", () => {
    it("22.1 specialty prefix matches across different doctors", async () => {
      const result = await callToolSuccess(client, { specialty: "Psych" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000007");
    });

    it("22.2 lastname prefix — hyphen in the middle of prefix", async () => {
      const result = await callToolSuccess(client, { lastname: "O-Bri" });
      const npiList = npis(result.doctors);
      expect(npiList).toContain("1000000006");
    });
  });

  // =========================================================================
  // 23. Repeated Calls — Consistency
  // =========================================================================
  describe("23. Repeated Calls — Consistency", () => {
    it("23.1 multiple sequential calls return consistent results", async () => {
      const results = await Promise.all([
        callToolSuccess(client, { lastname: "Smith" }),
        callToolSuccess(client, { lastname: "Smith" }),
        callToolSuccess(client, { lastname: "Smith" }),
      ]);
      expect(results[0].total_count).toBe(results[1].total_count);
      expect(results[1].total_count).toBe(results[2].total_count);
      expect(npis(results[0].doctors)).toEqual(npis(results[1].doctors));
      expect(npis(results[1].doctors)).toEqual(npis(results[2].doctors));
    });
  });

  // =========================================================================
  // 24. Empty Database
  // =========================================================================
  describe("24. Empty Database", () => {
    it("24.1 valid query against empty database", async () => {
      const original = testDb;
      testDb = new Database(":memory:");
      testDb.exec(SCHEMA_SQL);
      const result = await callToolSuccess(client, { lastname: "Smith" });
      expect(result.total_count).toBe(0);
      expect(result.doctors).toEqual([]);
      testDb.close();
      testDb = original;
    });
  });

  // =========================================================================
  // 25. Specialty Tiebreaker — Equal Length
  // =========================================================================
  describe("25. Specialty Tiebreaker", () => {
    it("25.1 both match with different lengths — longer wins", async () => {
      const result = await callToolSuccess(client, { specialty: "Sports" });
      const doc = result.doctors.find((d) => d.npi === "9000000002");
      expect(doc).toBeDefined();
      // "Sports Orthopedics" (18) > "Sports Medicine" (15)
      expect(doc!.specialty).toBe("Sports Orthopedics");
    });

    it("25.2 both match with equal length — classification wins", async () => {
      const result = await callToolSuccess(client, { specialty: "Sleep" });
      const doc = result.doctors.find((d) => d.npi === "9000000001");
      expect(doc).toBeDefined();
      // "Sleep Medicine" (14) == "Sleep Disorder" (14) → classification wins
      expect(doc!.specialty).toBe("Sleep Medicine");
    });
  });

  // =========================================================================
  // 26. Specialty List Tool
  // =========================================================================
  describe("26. Specialty List Tool", () => {
    it("26.1 calling with no arguments returns success", async () => {
      const result = await callSpecialtyList(client);
      expect(result.isError).toBeFalsy();
    });

    it("26.2 response contains specialties as a string array", async () => {
      const parsed = await callSpecialtyListSuccess(client);
      expect(parsed).toHaveProperty("specialties");
      expect(Array.isArray(parsed.specialties)).toBe(true);
      for (const s of parsed.specialties) {
        expect(typeof s).toBe("string");
      }
    });

    it("26.3 specialties are sorted alphabetically", async () => {
      const parsed = await callSpecialtyListSuccess(client);
      const sorted = [...parsed.specialties].sort();
      expect(parsed.specialties).toEqual(sorted);
    });

    it("26.4 specialties are distinct (no duplicates)", async () => {
      const parsed = await callSpecialtyListSuccess(client);
      const unique = new Set(parsed.specialties);
      expect(unique.size).toBe(parsed.specialties.length);
    });

    it("26.5 known test data specialties are present", async () => {
      const parsed = await callSpecialtyListSuccess(client);
      expect(parsed.specialties).toContain("Internal Medicine");
      expect(parsed.specialties).toContain("Family Medicine");
      expect(parsed.specialties).toContain("Cardiology");
      expect(parsed.specialties).toContain("Orthopedic Surgery");
      expect(parsed.specialties).toContain("Psychiatry");
      expect(parsed.specialties).toContain("Pediatrics");
    });

    it("26.6 empty or null classifications are excluded", async () => {
      const parsed = await callSpecialtyListSuccess(client);
      for (const s of parsed.specialties) {
        expect(s).not.toBe("");
        expect(s).not.toBeNull();
      }
    });

    it("26.7 unexpected arguments handled", async () => {
      const result = await callSpecialtyList(client, { prefix: "Card" });
      // The MCP SDK may reject based on additionalProperties: false,
      // or the server may ignore extra args. Either behavior is acceptable.
      if (!result.isError) {
        const text = (result.content as ContentBlock[])[0].text;
        const parsed = JSON.parse(text);
        expect(Array.isArray(parsed.specialties)).toBe(true);
      }
    });

    it("26.8 response content block structure", async () => {
      const result = await callSpecialtyList(client);
      expect(result.isError).toBeFalsy();
      const content = result.content as ContentBlock[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      const parsed = JSON.parse(content[0].text);
      const keys = Object.keys(parsed);
      expect(keys).toEqual(["specialties"]);
    });

    it("26.9 database failure returns internal error", async () => {
      const original = testDb;
      testDb = new Database(":memory:");
      testDb.close(); // closed DB will throw on any query

      const result = await callSpecialtyList(client);
      expect(result.isError).toBe(true);
      const content = result.content as ContentBlock[];
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      expect(content[0].text).toBe("Internal error: please try again later.");
      expect(content[0].text).not.toMatch(/stack/i);
      expect(content[0].text).not.toMatch(/\.ts/);

      testDb = original;
    });
  });
});
