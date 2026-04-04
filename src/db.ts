/**
 * src/db.ts — SQLite Database Access
 *
 * Manages a read-only singleton connection to the doctors SQLite database.
 * Used by the MCP server at runtime to serve search queries.
 *
 * Exports:
 *   openDb()  — Opens data/doctors.db in read-only mode
 *   closeDb() — Closes the connection
 *   getDb()   — Returns the open Database instance
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "doctors.db");

let db: DatabaseType | null = null;

export function openDb(): void {
  if (db) return;
  db = new Database(dbPath, { readonly: true });
}

export function getDb(): DatabaseType {
  if (!db) {
    throw new Error("Database not open. Call openDb() first.");
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
