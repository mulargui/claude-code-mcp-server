/**
 * data/import-data.ts — MySQL Dump → SQLite Importer
 *
 * Parses the MySQL dump file (healthylinkxdump.sql) and populates a SQLite
 * database (doctors.db) with the doctors table and indexes.
 *
 * The parser uses a character-by-character state machine to correctly handle
 * escaped quotes, commas inside strings, and \r literals in the dump.
 *
 * Post-import sanity checks verify row count and spot-check known records.
 * Exits with non-zero code on any failure so Docker builds break loudly.
 *
 * Usage: npx tsx data/import-data.ts
 *        npm run import-data
 */

import Database from "better-sqlite3";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpPath = path.join(__dirname, "healthylinkxdump.sql");
const dbPath = path.join(__dirname, "doctors.db");

// Column indices in the npidata2 INSERT VALUES tuples (0-based)
const COL = {
  NPI: 0,
  LAST_NAME: 1,
  FIRST_NAME: 2,
  FULL_STREET: 8,
  CITY: 9,
  SHORT_POSTAL_CODE: 13,
  PHONE: 14,
  GENDER: 15,
  CLASSIFICATION: 17,
  SPECIALIZATION: 18,
} as const;

// Minimum number of fields expected per tuple (npidata2 has 19 columns: indices 0–18)
const MIN_FIELDS = 19;

/**
 * Parse a MySQL VALUES clause into an array of string arrays (tuples).
 * Handles escaped single quotes (\'), commas inside quoted strings,
 * and literal \r sequences.
 */
function parseValues(valuesStr: string): string[][] {
  const tuples: string[][] = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    // Find the start of a tuple
    while (i < len && valuesStr[i] !== "(") i++;
    if (i >= len) break;
    i++; // skip '('

    const fields: string[] = [];
    while (i < len && valuesStr[i] !== ")") {
      if (valuesStr[i] === "'") {
        // Quoted field — collect until unescaped closing quote
        i++; // skip opening quote
        let value = "";
        while (i < len) {
          if (valuesStr[i] === "\\" && i + 1 < len) {
            if (valuesStr[i + 1] === "'") {
              value += "'";
              i += 2;
              continue;
            } else if (valuesStr[i + 1] === "r") {
              // literal \r in dump — skip it
              i += 2;
              continue;
            } else if (valuesStr[i + 1] === "n") {
              i += 2;
              continue;
            } else if (valuesStr[i + 1] === "\\") {
              value += "\\";
              i += 2;
              continue;
            }
          }
          if (valuesStr[i] === "'") {
            i++; // skip closing quote
            break;
          }
          value += valuesStr[i];
          i++;
        }
        fields.push(value);
      } else if (
        valuesStr[i] === "N" &&
        valuesStr.substring(i, i + 4) === "NULL"
      ) {
        fields.push("");
        i += 4;
      } else {
        // Unquoted field (shouldn't happen for string columns, but handle it)
        let value = "";
        while (i < len && valuesStr[i] !== "," && valuesStr[i] !== ")") {
          value += valuesStr[i];
          i++;
        }
        fields.push(value);
      }

      // Skip comma between fields
      if (i < len && valuesStr[i] === ",") i++;
    }

    if (i < len) i++; // skip ')'

    if (fields.length >= MIN_FIELDS) {
      tuples.push(fields);
    }

    // Skip comma between tuples or semicolon at end
    if (i < len && (valuesStr[i] === "," || valuesStr[i] === ";")) i++;
  }

  return tuples;
}

function main(): void {
  console.log("Reading MySQL dump...");
  const dump = readFileSync(dumpPath, "utf-8");

  // Remove existing DB if present
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  console.log("Creating SQLite database...");
  const db = new Database(dbPath);

  // Enable WAL mode for faster writes
  db.pragma("journal_mode = WAL");

  db.exec(`
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
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO doctors
      (npi, last_name, first_name, classification, specialization, gender, address, city, zipcode, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalParsed = 0;
  let totalSkipped = 0;

  console.log("Parsing and importing records...");

  const insertMany = db.transaction((tuples: string[][]) => {
    for (const fields of tuples) {
      const result = insert.run(
        fields[COL.NPI],
        fields[COL.LAST_NAME],
        fields[COL.FIRST_NAME],
        fields[COL.CLASSIFICATION],
        fields[COL.SPECIALIZATION],
        fields[COL.GENDER],
        fields[COL.FULL_STREET],
        fields[COL.CITY],
        fields[COL.SHORT_POSTAL_CODE],
        fields[COL.PHONE]
      );
      if (result.changes === 0) {
        totalSkipped++;
      }
    }
  });

  // Process line-by-line to avoid fragile regex matching across statement boundaries
  const INSERT_PREFIX = "INSERT INTO `npidata2` VALUES ";
  for (const line of dump.split("\n")) {
    if (!line.startsWith(INSERT_PREFIX)) continue;
    // Extract the VALUES clause: everything after the prefix, minus the trailing semicolon
    const valuesStr = line.slice(INSERT_PREFIX.length).replace(/;\s*$/, "");
    const tuples = parseValues(valuesStr);
    insertMany(tuples);
    totalParsed += tuples.length;
    process.stdout.write(`  ...${totalParsed} records\r`);
  }

  console.log(`\nParsed ${totalParsed} records, inserted ${totalParsed - totalSkipped}.`);
  if (totalSkipped > 0) {
    console.warn(`Warning: ${totalSkipped} duplicate NPI(s) skipped.`);
  }

  // Create indexes after bulk insert (faster than indexing during insert)
  console.log("Creating indexes...");
  db.exec(`
    CREATE INDEX idx_last_name      ON doctors(last_name);
    CREATE INDEX idx_classification ON doctors(classification);
    CREATE INDEX idx_specialization ON doctors(specialization);
    CREATE INDEX idx_gender         ON doctors(gender);
    CREATE INDEX idx_zipcode        ON doctors(zipcode);
  `);

  // Post-import sanity checks
  console.log("Running sanity checks...");
  let failed = false;

  // Check 1: Row count in expected range
  const rowCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM doctors").get() as { cnt: number }
  ).cnt;
  if (rowCount < 80000 || rowCount > 90000) {
    console.error(
      `FAIL: Row count ${rowCount} outside expected range 80,000–90,000`
    );
    failed = true;
  } else {
    console.log(`  Row count: ${rowCount} (OK)`);
  }

  // Check 2: Spot-check known NPIs
  const checks = [
    {
      npi: "1003000183",
      field: "last_name",
      expected: "CYPHERS",
    },
    {
      npi: "1003000183",
      field: "classification",
      expected: "Massage Therapist",
    },
    {
      npi: "1003002379",
      field: "last_name",
      expected: "SHRESTHA",
    },
    {
      npi: "1003002379",
      field: "classification",
      expected: "Internal Medicine",
    },
    {
      npi: "1003001116",
      field: "gender",
      expected: "F",
    },
  ];

  for (const check of checks) {
    const row = db.prepare("SELECT * FROM doctors WHERE npi = ?").get(check.npi) as
      | Record<string, string>
      | undefined;
    if (!row) {
      console.error(`FAIL: NPI ${check.npi} not found`);
      failed = true;
    } else if (row[check.field] !== check.expected) {
      console.error(
        `FAIL: NPI ${check.npi} ${check.field} = "${row[check.field]}", expected "${check.expected}"`
      );
      failed = true;
    } else {
      console.log(`  NPI ${check.npi} ${check.field} = "${check.expected}" (OK)`);
    }
  }

  db.close();

  if (failed) {
    console.error("\nSanity checks FAILED. Database may be corrupt.");
    process.exit(1);
  }

  console.log("\nImport completed successfully.");
}

main();
