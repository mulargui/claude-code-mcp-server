/**
 * data/verify-data.ts — Post-Import Data Verification
 *
 * Standalone script that opens doctors.db and runs test queries to confirm
 * the data was imported correctly and indexes are working.
 *
 * Checks:
 *   1. Total row count is reasonable
 *   2. Last name prefix search (LIKE 'SMI%') returns results
 *   3. Classification prefix search (LIKE 'Internal%') returns results
 *   4. Combined gender + zipcode filter returns results
 *
 * Exits with non-zero code on any failure.
 *
 * Usage: npx tsx data/verify-data.ts
 *        npm run verify-data
 */

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "doctors.db");

interface CountRow {
  cnt: number;
}

interface DoctorRow {
  npi: string;
  last_name: string;
  first_name: string;
  classification: string;
  specialization: string;
  gender: string;
  address: string;
  city: string;
  zipcode: string;
  phone: string;
}

function main(): void {
  console.log("Opening doctors.db for verification...\n");
  const db = new Database(dbPath, { readonly: true });

  let passed = 0;
  let failed = 0;

  function check(name: string, fn: () => boolean): void {
    process.stdout.write(`[CHECK] ${name}... `);
    if (fn()) {
      console.log("PASS");
      passed++;
    } else {
      console.log("FAIL");
      failed++;
    }
  }

  // Check 1: Total row count
  check("Total row count > 80,000", () => {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM doctors").get() as CountRow;
    console.log(`  Count: ${row.cnt}`);
    return row.cnt > 80000;
  });

  // Check 2: Last name prefix search
  check("Last name prefix 'SMI' returns results", () => {
    const rows = db
      .prepare(
        "SELECT npi, last_name, first_name, classification FROM doctors WHERE last_name LIKE 'SMI%' LIMIT 5"
      )
      .all() as DoctorRow[];
    console.log(`  Found: ${rows.length} (showing up to 5)`);
    for (const r of rows) {
      console.log(
        `    ${r.npi} ${r.last_name}, ${r.first_name} — ${r.classification}`
      );
    }
    return rows.length > 0;
  });

  // Check 3: Classification prefix search
  check("Classification prefix 'Internal' returns results", () => {
    const rows = db
      .prepare(
        "SELECT npi, last_name, first_name, classification FROM doctors WHERE classification LIKE 'Internal%' LIMIT 5"
      )
      .all() as DoctorRow[];
    console.log(`  Found: ${rows.length} (showing up to 5)`);
    for (const r of rows) {
      console.log(
        `    ${r.npi} ${r.last_name}, ${r.first_name} — ${r.classification}`
      );
    }
    return rows.length > 0;
  });

  // Check 4: Combined gender + zipcode filter
  check("Gender 'F' + zipcode '98223' returns results", () => {
    const row = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM doctors WHERE gender = 'F' AND zipcode = '98223'"
      )
      .get() as CountRow;
    console.log(`  Count: ${row.cnt}`);
    return row.cnt > 0;
  });

  db.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log("All verification checks passed.");
}

main();
