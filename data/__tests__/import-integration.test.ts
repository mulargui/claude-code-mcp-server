import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { importFromDump } from "../import-logic.js";
import type { Database as DatabaseType } from "better-sqlite3";

// Build a synthetic MySQL dump with realistic INSERT statements.
// Each tuple has 19 fields matching the npidata2 schema.
function buildDump(records: string[][]): string {
  const tuples = records
    .map((r) => `(${r.map((f) => `'${f}'`).join(",")})`)
    .join(",");
  return `INSERT INTO \`npidata2\` VALUES ${tuples};\n`;
}

// Create a 19-field record with sensible defaults; override by index.
function makeRecord(overrides: Partial<Record<number, string>> = {}): string[] {
  const defaults: string[] = [
    "1234567890",  // 0  NPI
    "SMITH",       // 1  last_name
    "JOHN",        // 2  first_name
    "",            // 3
    "",            // 4
    "",            // 5
    "",            // 6
    "",            // 7
    "123 Main St", // 8  address
    "Seattle",     // 9  city
    "",            // 10
    "",            // 11
    "",            // 12
    "98101",       // 13 zipcode
    "2065551234",  // 14 phone
    "M",           // 15 gender
    "",            // 16
    "Family Medicine",   // 17 classification
    "General Practice",  // 18 specialization
  ];
  for (const [idx, val] of Object.entries(overrides)) {
    defaults[Number(idx)] = val;
  }
  return defaults;
}

describe("import pipeline integration", () => {
  const testDir = tmpdir();
  let dumpFile: string;
  let dbFile: string;
  let db: DatabaseType | null = null;

  afterEach(() => {
    if (db) {
      try { db.close(); } catch { /* already closed */ }
      db = null;
    }
    for (const f of [dumpFile, dbFile]) {
      if (f && existsSync(f)) unlinkSync(f);
    }
  });

  function run(records: string[][]): void {
    const suffix = Math.random().toString(36).slice(2, 8);
    dumpFile = path.join(testDir, `test-dump-${suffix}.sql`);
    dbFile = path.join(testDir, `test-doctors-${suffix}.db`);
    writeFileSync(dumpFile, buildDump(records));
    const result = importFromDump(dumpFile, dbFile);
    db = result.db;
  }

  it("creates the doctors table with correct columns", () => {
    run([makeRecord()]);
    const cols = db!
      .prepare("PRAGMA table_info(doctors)")
      .all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toEqual([
      "npi", "last_name", "first_name", "classification",
      "specialization", "gender", "address", "city", "zipcode", "phone",
    ]);
  });

  it("inserts the correct number of records", () => {
    const records = [
      makeRecord({ 0: "NPI001" }),
      makeRecord({ 0: "NPI002" }),
      makeRecord({ 0: "NPI003" }),
    ];
    run(records);
    const row = db!.prepare("SELECT COUNT(*) as cnt FROM doctors").get() as { cnt: number };
    expect(row.cnt).toBe(3);
  });

  it("maps fields to the correct columns", () => {
    run([makeRecord({
      0: "9999999999",
      1: "DOE",
      2: "JANE",
      8: "456 Oak Ave",
      9: "Portland",
      13: "97201",
      14: "5035559876",
      15: "F",
      17: "Internal Medicine",
      18: "Cardiology",
    })]);
    const row = db!.prepare("SELECT * FROM doctors WHERE npi = '9999999999'").get() as Record<string, string>;
    expect(row.last_name).toBe("DOE");
    expect(row.first_name).toBe("JANE");
    expect(row.address).toBe("456 Oak Ave");
    expect(row.city).toBe("Portland");
    expect(row.zipcode).toBe("97201");
    expect(row.phone).toBe("5035559876");
    expect(row.gender).toBe("F");
    expect(row.classification).toBe("Internal Medicine");
    expect(row.specialization).toBe("Cardiology");
  });

  it("skips duplicate NPIs via INSERT OR IGNORE", () => {
    const records = [
      makeRecord({ 0: "DUPE1", 1: "FIRST" }),
      makeRecord({ 0: "DUPE1", 1: "SECOND" }),
    ];
    run(records);
    const row = db!.prepare("SELECT COUNT(*) as cnt FROM doctors").get() as { cnt: number };
    expect(row.cnt).toBe(1);
    const doc = db!.prepare("SELECT last_name FROM doctors WHERE npi = 'DUPE1'").get() as { last_name: string };
    expect(doc.last_name).toBe("FIRST");
  });

  it("creates indexes on expected columns", () => {
    run([makeRecord()]);
    const indexes = db!
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name).sort();
    expect(names).toEqual([
      "idx_classification",
      "idx_gender",
      "idx_last_name",
      "idx_specialization",
      "idx_zipcode",
    ]);
  });

  it("returns correct parsed and skipped counts", () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    dumpFile = path.join(testDir, `test-dump-${suffix}.sql`);
    dbFile = path.join(testDir, `test-doctors-${suffix}.db`);
    const records = [
      makeRecord({ 0: "A1" }),
      makeRecord({ 0: "A2" }),
      makeRecord({ 0: "A1" }), // duplicate
    ];
    writeFileSync(dumpFile, buildDump(records));
    const result = importFromDump(dumpFile, dbFile);
    db = result.db;
    expect(result.totalParsed).toBe(3);
    expect(result.totalSkipped).toBe(1);
  });
});
