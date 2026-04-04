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
