// Stub — functional implementation deferred
// Creates an empty doctors.db with the correct schema so the Docker build succeeds.

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "doctors.db");

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS doctors (
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

  CREATE INDEX IF NOT EXISTS idx_last_name      ON doctors(last_name);
  CREATE INDEX IF NOT EXISTS idx_classification ON doctors(classification);
  CREATE INDEX IF NOT EXISTS idx_specialization ON doctors(specialization);
  CREATE INDEX IF NOT EXISTS idx_gender         ON doctors(gender);
  CREATE INDEX IF NOT EXISTS idx_zipcode        ON doctors(zipcode);
`);

console.log("Created empty doctors.db with schema");
db.close();
