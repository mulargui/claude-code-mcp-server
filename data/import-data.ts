/**
 * data/import-data.ts — MySQL Dump → SQLite Importer
 *
 * Thin wrapper around the import pipeline. Calls importFromDump with the
 * production dump and database paths, then runs sanity checks against
 * known records.
 *
 * Exits with non-zero code on any failure so Docker builds break loudly.
 *
 * Usage: npx tsx data/import-data.ts
 *        npm run import-data
 */

import { fileURLToPath } from "url";
import path from "path";
import { importFromDump } from "./import-logic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpPath = path.join(__dirname, "healthylinkxdump.sql");
const dbPath = path.join(__dirname, "doctors.db");

function main(): void {
  console.log("Reading MySQL dump...");
  const { totalParsed, totalSkipped, db } = importFromDump(dumpPath, dbPath);

  console.log(`Parsed ${totalParsed} records, inserted ${totalParsed - totalSkipped}.`);
  if (totalSkipped > 0) {
    console.warn(`Warning: ${totalSkipped} duplicate NPI(s) skipped.`);
  }

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
