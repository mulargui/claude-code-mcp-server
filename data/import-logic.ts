/**
 * data/import-logic.ts — Core Import Pipeline
 *
 * Reusable import function that reads a MySQL dump file and populates a SQLite
 * database with the doctors table and indexes. Used by import-data.ts (production)
 * and integration tests (with synthetic data).
 *
 * Exports:
 *   importFromDump(dumpPath, dbPath) — run the full import pipeline
 *   ImportResult                      — return type with row counts
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { parseValues, COL } from "./parse-values.js";

export interface ImportResult {
  totalParsed: number;
  totalSkipped: number;
  db: DatabaseType;
}

export function importFromDump(dumpPath: string, dbPath: string): ImportResult {
  const dump = readFileSync(dumpPath, "utf-8");

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const db = new Database(dbPath);
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

  const INSERT_PREFIX = "INSERT INTO `npidata2` VALUES ";
  for (const line of dump.split("\n")) {
    if (!line.startsWith(INSERT_PREFIX)) continue;
    const valuesStr = line.slice(INSERT_PREFIX.length).replace(/;\s*$/, "");
    const tuples = parseValues(valuesStr);
    insertMany(tuples);
    totalParsed += tuples.length;
  }

  db.exec(`
    CREATE INDEX idx_last_name      ON doctors(last_name);
    CREATE INDEX idx_classification ON doctors(classification);
    CREATE INDEX idx_specialization ON doctors(specialization);
    CREATE INDEX idx_gender         ON doctors(gender);
    CREATE INDEX idx_zipcode        ON doctors(zipcode);
  `);

  return { totalParsed, totalSkipped, db };
}
