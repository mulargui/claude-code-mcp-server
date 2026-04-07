/**
 * src/types.ts — Shared Type Definitions
 *
 * Defines the core data shapes used across the MCP server:
 * search input parameters, doctor records, and search results.
 */
export interface DoctorSearchInput {
  lastname?: string;
  specialty?: string;
  gender?: string;
  zipcode?: string;
}

export interface DoctorRecord {
  npi: string;
  lastname: string;
  firstname: string;
  specialty: string;
  gender: string;
  address: string;
  city: string;
  zipcode: string;
  phone: string;
}

export interface SearchResult {
  total_count: number;
  doctors: DoctorRecord[];
}
