/**
 * src/search.ts — Doctor Search & Specialty List Queries
 *
 * Builds and executes parameterized SQL queries against the doctors
 * SQLite database based on validated search input parameters.
 *
 * Handles dynamic WHERE clause construction, gender normalization,
 * specialty-to-column mapping, result capping (50), and total count.
 * Also provides listSpecialties() for retrieving distinct specialty names.
 */
import { getDb } from "./db.js";
import type { DoctorSearchInput, DoctorRecord, SearchResult, SpecialtyListResult } from "./types.js";

const RESULT_LIMIT = 50;

function normalizeGender(gender: string): string {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return gender;
}

/**
 * Picks which specialty string to return in a doctor record.
 *
 * When a specialty filter is active, return whichever column matched the
 * prefix (if both match, return the longer one so the user sees the most
 * specific label). When no filter is active, return the longer of the two
 * columns. Classification wins ties in both cases because it represents
 * the primary taxonomy category.
 */
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

  if (conditions.length === 0) {
    throw new Error("searchDoctors called with no filters");
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM doctors ${whereClause}`)
    .get(...params) as { count: number };
  const totalCount = countRow.count;

  const rows = db
    .prepare(
      `SELECT npi, last_name, first_name, classification, specialization, gender, address, city, zipcode, phone FROM doctors ${whereClause} ORDER BY npi ASC LIMIT ?`
    )
    .all(...params, RESULT_LIMIT) as RawRow[];

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

export function listSpecialties(): SpecialtyListResult {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT DISTINCT classification FROM doctors WHERE classification IS NOT NULL AND classification != '' ORDER BY classification"
    )
    .all() as { classification: string }[];
  return { specialties: rows.map((row) => row.classification) };
}
