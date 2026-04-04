// Stub — functional implementation deferred
import type { DoctorSearchInput, SearchResult } from "./types.js";

export function searchDoctors(_input: DoctorSearchInput): SearchResult {
  return { total_count: 0, doctors: [] };
}
