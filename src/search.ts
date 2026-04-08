/**
 * src/search.ts — Doctor Search Query
 *
 * Builds and executes parameterized SQL queries against the doctors
 * SQLite database based on validated search input parameters.
 *
 * Handles dynamic WHERE clause construction, gender normalization,
 * specialty-to-column mapping, result capping (50), and total count.
 */
import { getDb } from "./db.js";
import type { DoctorSearchInput, DoctorRecord, SearchResult } from "./types.js";

const RESULT_LIMIT = 50;

function normalizeGender(gender: string): string {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return gender;
}

function resolveSpecialty(
  classification: string,
  specialization: string,
  specialtyFilter?: string
): string {
  const cls = classification || "";
  const spec = specialization || "";

  if (specialtyFilter) {
    const prefix = specialtyFilter.toLowerCase();
    const clsMatches = cls.toLowerCase().startsWith(prefix);
    const specMatches = spec.toLowerCase().startsWith(prefix);

    if (clsMatches && specMatches) {
      return spec.length > cls.length ? spec : cls;
    }
    if (specMatches) return spec;
    if (clsMatches) return cls;
  }

  // No specialty filter or no match: return the longer (classification wins ties)
  if (spec.length > cls.length) return spec;
  return cls;
}

interface RawRow {
  npi: string;
  last_name: string;
  first_name: string;
  classification: string | null;
  specialization: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  zipcode: string | null;
  phone: string | null;
}

export function searchDoctors(input: DoctorSearchInput): SearchResult {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (input.lastname !== undefined) {
    conditions.push("last_name LIKE ? || '%'");
    params.push(input.lastname);
  }

  if (input.specialty !== undefined) {
    conditions.push(
      "(classification LIKE ? || '%' OR specialization LIKE ? || '%')"
    );
    params.push(input.specialty, input.specialty);
  }

  if (input.gender !== undefined) {
    conditions.push("gender = ?");
    params.push(normalizeGender(input.gender));
  }

  if (input.zipcode !== undefined) {
    conditions.push("zipcode = ?");
    params.push(input.zipcode);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM doctors ${whereClause}`)
    .get(...params) as { count: number };
  const totalCount = countRow.count;

  const rows = db
    .prepare(
      `SELECT npi, last_name, first_name, classification, specialization, gender, address, city, zipcode, phone FROM doctors ${whereClause} ORDER BY npi ASC LIMIT ${RESULT_LIMIT}`
    )
    .all(...params) as RawRow[];

  const doctors: DoctorRecord[] = rows.map((row) => ({
    npi: row.npi,
    lastname: row.last_name,
    firstname: row.first_name,
    specialty: resolveSpecialty(row.classification ?? "", row.specialization ?? "", input.specialty),
    gender: row.gender ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    zipcode: row.zipcode ?? "",
    phone: row.phone ?? "",
  }));

  return { total_count: totalCount, doctors };
}
