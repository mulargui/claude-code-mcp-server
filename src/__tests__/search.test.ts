/**
 * src/__tests__/search.test.ts — Doctor Search & Specialty List Query Tests
 *
 * Tests searchDoctors() and listSpecialties() against an in-memory SQLite
 * database seeded with controlled test data. Mocks db.ts to return the test database.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

let testDb: DatabaseType;

// Mock db.ts so getDb() returns our in-memory test database
vi.mock("../db.js", () => ({
  getDb: () => testDb,
}));

// Import after mock is set up
const { searchDoctors, listSpecialties } = await import("../search.js");

const TEST_DATA = [
  ["1000000001", "Smith", "John", "Internal Medicine", "Cardiovascular Disease", "M", "100 Main St", "Los Angeles", "90210", "3105551001"],
  ["1000000002", "Smith", "Jane", "Internal Medicine", "", "F", "200 Oak Ave", "Los Angeles", "90210", "3105551002"],
  ["1000000003", "Smithson", "Robert", "Family Medicine", "", "M", "300 Elm St", "Chicago", "60601", "3125551003"],
  ["1000000004", "Johnson", "Emily", "Cardiology", "Interventional Cardiology", "F", "400 Pine Rd", "New York", "10001", "2125551004"],
  ["1000000005", "Williams", "Michael", "Orthopedic Surgery", "", "M", "500 Cedar Ln", "Houston", "77001", "7135551005"],
  ["1000000006", "O-Brien", "Sarah", "Internal Medicine", "Geriatric Medicine", "F", "600 Birch Dr", "Portland", "97201", "5035551006"],
  ["1000000007", "Garcia", "Carlos", "Psychiatry", "Child Psychiatry", "M", "700 Maple St", "Miami", "33101", "3055551007"],
];

beforeAll(() => {
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

  // Add 55 "Test" doctors for cap testing
  for (let i = 0; i < 55; i++) {
    const npi = `2000000${String(i).padStart(3, "0")}`;
    insert.run(npi, "Test", `First${i}`, "Pediatrics", "", "M", `${i} Test St`, "Testville", "99999", `5551000${String(i).padStart(3, "0")}`);
  }
});

afterAll(() => {
  testDb?.close();
});

// --- Prefix matching ---

describe("prefix matching", () => {
  it("lastname prefix matches partial name", () => {
    const result = searchDoctors({ lastname: "Smi" });
    const names = result.doctors.map((d) => d.lastname);
    expect(names).toContain("Smith");
    expect(names).toContain("Smithson");
    expect(names).not.toContain("Johnson");
  });

  it("lastname prefix matches full name and extensions", () => {
    const result = searchDoctors({ lastname: "Smith" });
    expect(result.doctors).toHaveLength(3);
  });

  it("lastname exact full name only", () => {
    const result = searchDoctors({ lastname: "Smithson" });
    expect(result.doctors).toHaveLength(1);
    expect(result.doctors[0].lastname).toBe("Smithson");
  });

  it("specialty prefix matches classification", () => {
    const result = searchDoctors({ specialty: "Internal" });
    const npis = result.doctors.map((d) => d.npi);
    expect(npis).toContain("1000000001");
    expect(npis).toContain("1000000002");
    expect(npis).toContain("1000000006");
  });

  it("specialty prefix matches specialization", () => {
    const result = searchDoctors({ specialty: "Cardiovascular" });
    expect(result.doctors.map((d) => d.npi)).toContain("1000000001");
  });

  it("specialty prefix matches both classification and specialization", () => {
    const result = searchDoctors({ specialty: "Cardio" });
    const npis = result.doctors.map((d) => d.npi);
    expect(npis).toContain("1000000004"); // Cardiology / Interventional Cardiology
    expect(npis).toContain("1000000001"); // Cardiovascular Disease
  });

  it("short specialty prefix matches broadly", () => {
    const result = searchDoctors({ specialty: "Int" });
    const npis = result.doctors.map((d) => d.npi);
    // Internal Medicine doctors
    expect(npis).toContain("1000000001");
    expect(npis).toContain("1000000002");
    expect(npis).toContain("1000000006");
    // Interventional Cardiology
    expect(npis).toContain("1000000004");
  });
});

// --- Case insensitivity ---

describe("case insensitivity", () => {
  it("lowercase lastname matches", () => {
    const result = searchDoctors({ lastname: "smith" });
    expect(result.doctors.length).toBeGreaterThan(0);
  });

  it("uppercase lastname matches", () => {
    const result = searchDoctors({ lastname: "SMITH" });
    expect(result.doctors.length).toBeGreaterThan(0);
  });

  it("mixed case lastname matches", () => {
    const result = searchDoctors({ lastname: "sMiTh" });
    expect(result.doctors.length).toBeGreaterThan(0);
  });

  it("case insensitive specialty prefix", () => {
    const result = searchDoctors({ specialty: "internal medicine" });
    expect(result.doctors.length).toBeGreaterThan(0);
  });
});

// --- Gender normalization ---

describe("gender normalization", () => {
  it('"male" matches M in database', () => {
    const result = searchDoctors({ lastname: "Smith", gender: "male" });
    const npis = result.doctors.map((d) => d.npi);
    expect(npis).toContain("1000000001");
    expect(npis).not.toContain("1000000002");
  });

  it('"female" matches F in database', () => {
    const result = searchDoctors({ lastname: "Smith", gender: "female" });
    const npis = result.doctors.map((d) => d.npi);
    expect(npis).toContain("1000000002");
    expect(npis).not.toContain("1000000001");
  });

  it('"M" matches directly', () => {
    const result = searchDoctors({ lastname: "Smith", gender: "M" });
    result.doctors.forEach((d) => expect(d.gender).toBe("M"));
  });

  it('"F" matches directly', () => {
    const result = searchDoctors({ lastname: "Smith", gender: "F" });
    result.doctors.forEach((d) => expect(d.gender).toBe("F"));
  });
});

// --- Exact matching ---

describe("exact matching", () => {
  it("zipcode exact match only", () => {
    const result = searchDoctors({ lastname: "Smith", zipcode: "90210" });
    result.doctors.forEach((d) => expect(d.zipcode).toBe("90210"));
    expect(result.doctors.length).toBe(2);
  });

  it("gender exact match", () => {
    const result = searchDoctors({ lastname: "Smith", gender: "M" });
    result.doctors.forEach((d) => expect(d.gender).toBe("M"));
  });
});

// --- AND combination ---

describe("AND combination", () => {
  it("lastname AND gender intersection", () => {
    const result = searchDoctors({ lastname: "Smith", gender: "male" });
    // "Smith" prefix matches Smith (1000000001, M) and Smithson (1000000003, M)
    expect(result.doctors).toHaveLength(2);
    const npis = result.doctors.map((d) => d.npi);
    expect(npis).toContain("1000000001");
    expect(npis).toContain("1000000003");
  });

  it("lastname AND zipcode intersection", () => {
    const result = searchDoctors({ lastname: "Smi", zipcode: "90210" });
    const npis = result.doctors.map((d) => d.npi);
    expect(npis).toContain("1000000001");
    expect(npis).toContain("1000000002");
    expect(npis).not.toContain("1000000003");
  });

  it("specialty AND gender AND zipcode triple intersection", () => {
    const result = searchDoctors({ specialty: "Internal", gender: "male", zipcode: "90210" });
    expect(result.doctors).toHaveLength(1);
    expect(result.doctors[0].npi).toBe("1000000001");
  });

  it("all four filters quadruple intersection", () => {
    const result = searchDoctors({
      lastname: "Smith",
      specialty: "Internal",
      gender: "male",
      zipcode: "90210",
    });
    expect(result.doctors).toHaveLength(1);
    expect(result.doctors[0].npi).toBe("1000000001");
    expect(result.total_count).toBe(1);
  });

  it("empty intersection returns zero results", () => {
    // Use a zipcode that no Smith/Smithson has
    const result = searchDoctors({ lastname: "Smith", gender: "male", zipcode: "99998" });
    expect(result.total_count).toBe(0);
    expect(result.doctors).toEqual([]);
  });
});

// --- Result cap and total count ---

describe("result cap and total count", () => {
  it("caps at 50 results", () => {
    const result = searchDoctors({ lastname: "Test" });
    expect(result.doctors).toHaveLength(50);
    expect(result.total_count).toBe(55);
  });

  it("total_count reflects true count, not capped", () => {
    const result = searchDoctors({ lastname: "Test" });
    expect(result.total_count).toBe(55);
  });

  it("fewer than 50 results — no cap applied", () => {
    const result = searchDoctors({ lastname: "Smi" });
    expect(result.doctors).toHaveLength(3);
    expect(result.total_count).toBe(3);
  });

  it("zero results", () => {
    const result = searchDoctors({ lastname: "Zzz" });
    expect(result.total_count).toBe(0);
    expect(result.doctors).toEqual([]);
  });
});

// --- Output format ---

describe("output format", () => {
  it("all fields present in each doctor record", () => {
    const result = searchDoctors({ lastname: "Smith" });
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

  it("no extra fields like classification or specialization", () => {
    const result = searchDoctors({ lastname: "Smith" });
    for (const doc of result.doctors) {
      expect(doc).not.toHaveProperty("classification");
      expect(doc).not.toHaveProperty("specialization");
      expect(doc).not.toHaveProperty("last_name");
      expect(doc).not.toHaveProperty("first_name");
    }
  });

  it("gender is M/F in output", () => {
    const result = searchDoctors({ lastname: "Smith" });
    for (const doc of result.doctors) {
      expect(["M", "F"]).toContain(doc.gender);
    }
  });
});

// --- Specialty field mapping ---

describe("specialty field mapping", () => {
  it("specialty filter matches only classification — classification returned", () => {
    const result = searchDoctors({ specialty: "Internal" });
    const doc = result.doctors.find((d) => d.npi === "1000000002");
    expect(doc?.specialty).toBe("Internal Medicine");
  });

  it("specialty filter matches only specialization — specialization returned", () => {
    const result = searchDoctors({ specialty: "Cardiovascular" });
    const doc = result.doctors.find((d) => d.npi === "1000000001");
    expect(doc?.specialty).toBe("Cardiovascular Disease");
  });

  it("specialty filter matches only classification — classification returned (Cardio prefix)", () => {
    const result = searchDoctors({ specialty: "Cardio" });
    const doc = result.doctors.find((d) => d.npi === "1000000004");
    // classification = "Cardiology" matches "Cardio" prefix
    // specialization = "Interventional Cardiology" does NOT match "Cardio" prefix
    expect(doc?.specialty).toBe("Cardiology");
  });

  it("no specialty filter — longer of classification/specialization returned", () => {
    const result = searchDoctors({ lastname: "Smith" });
    const doc = result.doctors.find((d) => d.npi === "1000000001");
    // classification = "Internal Medicine" (17), specialization = "Cardiovascular Disease" (22)
    expect(doc?.specialty).toBe("Cardiovascular Disease");
  });

  it("no specialty filter, only classification populated", () => {
    const result = searchDoctors({ lastname: "Smith" });
    const doc = result.doctors.find((d) => d.npi === "1000000002");
    // classification = "Internal Medicine", specialization = ""
    expect(doc?.specialty).toBe("Internal Medicine");
  });

  it("no specialty filter, empty specialization — classification returned", () => {
    const result = searchDoctors({ lastname: "Smithson" });
    const doc = result.doctors[0];
    expect(doc?.specialty).toBe("Family Medicine");
  });
});

// --- Result ordering ---

describe("result ordering", () => {
  it("sorted by NPI ascending", () => {
    const result = searchDoctors({ lastname: "Smith" });
    const npis = result.doctors.map((d) => d.npi);
    const sorted = [...npis].sort();
    expect(npis).toEqual(sorted);
  });

  it("deterministic order across calls", () => {
    const r1 = searchDoctors({ lastname: "Test" });
    const r2 = searchDoctors({ lastname: "Test" });
    expect(r1.doctors.map((d) => d.npi)).toEqual(r2.doctors.map((d) => d.npi));
  });
});

// --- No results (valid queries) ---

describe("no results", () => {
  it("non-matching lastname", () => {
    const result = searchDoctors({ lastname: "Xyz" });
    expect(result.total_count).toBe(0);
    expect(result.doctors).toEqual([]);
  });

  it("non-matching specialty", () => {
    const result = searchDoctors({ specialty: "Xyz" });
    expect(result.total_count).toBe(0);
    expect(result.doctors).toEqual([]);
  });

  it("matching lastname but non-matching zipcode", () => {
    const result = searchDoctors({ lastname: "Smith", zipcode: "00000" });
    expect(result.total_count).toBe(0);
    expect(result.doctors).toEqual([]);
  });
});

// --- Edge cases ---

describe("edge cases", () => {
  it("hyphenated last name matches", () => {
    const result = searchDoctors({ lastname: "O-B" });
    expect(result.doctors.map((d) => d.npi)).toContain("1000000006");
  });

  it("very long input returns zero results without crashing", () => {
    const result = searchDoctors({ lastname: "Abcdefghijklmnopqrstuvwxyz" });
    expect(result.total_count).toBe(0);
    expect(result.doctors).toEqual([]);
  });
});

// --- Specialty tiebreaker ---

describe("specialty tiebreaker", () => {
  it("equal length — classification wins", () => {
    // Insert a doctor with equal-length classification and specialization
    const insert = testDb.prepare(
      "INSERT INTO doctors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insert.run("9000000001", "Tiebreak", "Test", "Sleep Medicine", "Sleep Disorder", "M", "1 Test", "Test", "00001", "5550000001");

    const result = searchDoctors({ specialty: "Sleep" });
    const doc = result.doctors.find((d) => d.npi === "9000000001");
    expect(doc?.specialty).toBe("Sleep Medicine");

    // Clean up
    testDb.prepare("DELETE FROM doctors WHERE npi = '9000000001'").run();
  });

  it("different length — longer wins", () => {
    const insert = testDb.prepare(
      "INSERT INTO doctors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insert.run("9000000002", "Tiebreak", "Test", "Sports Medicine", "Sports Orthopedics", "M", "1 Test", "Test", "00002", "5550000002");

    const result = searchDoctors({ specialty: "Sports" });
    const doc = result.doctors.find((d) => d.npi === "9000000002");
    expect(doc?.specialty).toBe("Sports Orthopedics");

    testDb.prepare("DELETE FROM doctors WHERE npi = '9000000002'").run();
  });
});

// --- listSpecialties ---

describe("listSpecialties", () => {
  it("returns distinct classification values", () => {
    const result = listSpecialties();
    const unique = new Set(result.specialties);
    expect(unique.size).toBe(result.specialties.length);
  });

  it("returns specialties sorted alphabetically", () => {
    const result = listSpecialties();
    const sorted = [...result.specialties].sort();
    expect(result.specialties).toEqual(sorted);
  });

  it("contains known specialties from test data", () => {
    const result = listSpecialties();
    expect(result.specialties).toContain("Internal Medicine");
    expect(result.specialties).toContain("Family Medicine");
    expect(result.specialties).toContain("Cardiology");
    expect(result.specialties).toContain("Orthopedic Surgery");
    expect(result.specialties).toContain("Psychiatry");
    expect(result.specialties).toContain("Pediatrics");
  });

  it("excludes empty classification values", () => {
    const insert = testDb.prepare(
      "INSERT INTO doctors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insert.run("9000000003", "EmptySpec", "Test", "", "Something", "M", "1 Test", "Test", "00001", "5550000001");

    const result = listSpecialties();
    expect(result.specialties).not.toContain("");

    testDb.prepare("DELETE FROM doctors WHERE npi = '9000000003'").run();
  });

  it("excludes null classification values", () => {
    const insert = testDb.prepare(
      "INSERT INTO doctors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insert.run("9000000004", "NullSpec", "Test", null, "Something", "M", "1 Test", "Test", "00001", "5550000001");

    const result = listSpecialties();
    for (const s of result.specialties) {
      expect(s).not.toBeNull();
      expect(s).not.toBe("");
    }

    testDb.prepare("DELETE FROM doctors WHERE npi = '9000000004'").run();
  });

  it("returns the correct result shape", () => {
    const result = listSpecialties();
    expect(result).toHaveProperty("specialties");
    expect(Array.isArray(result.specialties)).toBe(true);
    for (const s of result.specialties) {
      expect(typeof s).toBe("string");
    }
  });
});
