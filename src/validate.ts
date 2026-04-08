/**
 * src/validate.ts — Input Validation
 *
 * Validates DoctorSearchInput fields before executing a query.
 * Returns null on success or an error message string on failure.
 *
 * Validation order:
 *   1. Combination rules (at least one filter; must include lastname or specialty)
 *   2. Individual field rules (lastname, specialty, gender, zipcode — in that order)
 */
import type { DoctorSearchInput } from "./types.js";

const LASTNAME_RE = /^[A-Za-z][A-Za-z-]*$/;
const SPECIALTY_RE = /^(?=.*[A-Za-z])[A-Za-z -]+$/;
const ZIPCODE_RE = /^[0-9]{5}$/;
const VALID_GENDERS = new Set(["male", "female", "M", "F"]);

export function validate(input: DoctorSearchInput): string | null {
  const { lastname, specialty, gender, zipcode } = input;

  // Phase A — combination rules (use undefined checks so empty strings reach field validation)
  if (
    lastname === undefined &&
    specialty === undefined &&
    gender === undefined &&
    zipcode === undefined
  ) {
    return "At least one filter is required.";
  }

  if (lastname === undefined && specialty === undefined) {
    return "At least 'lastname' or 'specialty' must be included as a filter.";
  }

  // Phase B — individual field validation (order: lastname, specialty, gender, zipcode)
  if (lastname !== undefined) {
    if (lastname.length < 3 || !LASTNAME_RE.test(lastname)) {
      return "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only.";
    }
  }

  if (specialty !== undefined) {
    if (specialty.length < 3 || !SPECIALTY_RE.test(specialty)) {
      return "Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only.";
    }
  }

  if (gender !== undefined) {
    if (!VALID_GENDERS.has(gender)) {
      return "Invalid gender: must be one of 'male', 'female', 'M', 'F'.";
    }
  }

  if (zipcode !== undefined) {
    if (!ZIPCODE_RE.test(zipcode)) {
      return "Invalid zipcode: must be exactly 5 digits.";
    }
  }

  return null;
}
