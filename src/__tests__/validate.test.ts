/**
 * src/__tests__/validate.test.ts — Input Validation Unit Tests
 *
 * Tests the validate() function covering combination rules,
 * individual field validation, ordering, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { validate } from "../validate.js";

describe("validate", () => {
  // --- Combination rules ---

  describe("combination rules", () => {
    it("rejects empty input", () => {
      expect(validate({})).toBe("At least one filter is required.");
    });

    it("rejects gender-only", () => {
      expect(validate({ gender: "male" })).toBe(
        "At least 'lastname' or 'specialty' must be included as a filter."
      );
    });

    it("rejects zipcode-only", () => {
      expect(validate({ zipcode: "90210" })).toBe(
        "At least 'lastname' or 'specialty' must be included as a filter."
      );
    });

    it("rejects gender + zipcode without lastname or specialty", () => {
      expect(validate({ gender: "female", zipcode: "90210" })).toBe(
        "At least 'lastname' or 'specialty' must be included as a filter."
      );
    });

    it("accepts lastname alone", () => {
      expect(validate({ lastname: "Smith" })).toBeNull();
    });

    it("accepts specialty alone", () => {
      expect(validate({ specialty: "Internal Medicine" })).toBeNull();
    });

    it("accepts all four filters", () => {
      expect(
        validate({
          lastname: "Smith",
          specialty: "Internal",
          gender: "male",
          zipcode: "90210",
        })
      ).toBeNull();
    });

    it("accepts lastname + gender", () => {
      expect(validate({ lastname: "Smith", gender: "female" })).toBeNull();
    });

    it("accepts specialty + zipcode", () => {
      expect(validate({ specialty: "Cardio", zipcode: "10001" })).toBeNull();
    });

    it("accepts lastname + zipcode", () => {
      expect(validate({ lastname: "Smith", zipcode: "90210" })).toBeNull();
    });

    it("accepts specialty + gender", () => {
      expect(validate({ specialty: "Pediatrics", gender: "M" })).toBeNull();
    });
  });

  // --- Lastname validation ---

  describe("lastname", () => {
    it("accepts valid alphabetic", () => {
      expect(validate({ lastname: "Smith" })).toBeNull();
    });

    it("accepts hyphenated name", () => {
      expect(validate({ lastname: "O-Brien" })).toBeNull();
    });

    it("rejects 1-character name", () => {
      expect(validate({ lastname: "S" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("rejects 2-character name", () => {
      expect(validate({ lastname: "Sm" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("accepts exactly 3 characters", () => {
      expect(validate({ lastname: "Smi" })).toBeNull();
    });

    it("rejects digits", () => {
      expect(validate({ lastname: "Smith2" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("rejects special characters", () => {
      expect(validate({ lastname: "Smith!" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("rejects spaces", () => {
      expect(validate({ lastname: "De La Cruz" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("rejects empty string", () => {
      expect(validate({ lastname: "" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("rejects unicode accented characters", () => {
      expect(validate({ lastname: "Müller" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("rejects whitespace-only", () => {
      expect(validate({ lastname: "   " })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });
  });

  // --- Specialty validation ---

  describe("specialty", () => {
    it("accepts valid value", () => {
      expect(validate({ specialty: "Cardiology" })).toBeNull();
    });

    it("accepts spaces and hyphens", () => {
      expect(validate({ specialty: "Internal Medicine" })).toBeNull();
    });

    it("rejects 1 character", () => {
      expect(validate({ specialty: "C" })).toBe(
        "Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."
      );
    });

    it("rejects 2 characters", () => {
      expect(validate({ specialty: "Ca" })).toBe(
        "Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."
      );
    });

    it("accepts exactly 3 characters", () => {
      expect(validate({ specialty: "Car" })).toBeNull();
    });

    it("rejects digits", () => {
      expect(validate({ specialty: "Card1ology" })).toBe(
        "Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."
      );
    });

    it("rejects special characters", () => {
      expect(validate({ specialty: "Card@ology" })).toBe(
        "Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."
      );
    });

    it("rejects empty string", () => {
      expect(validate({ specialty: "" })).toBe(
        "Invalid specialty: must be at least 3 characters, alphabetic, spaces, and hyphens only."
      );
    });
  });

  // --- Gender validation ---

  describe("gender", () => {
    it('accepts "male"', () => {
      expect(validate({ lastname: "Smith", gender: "male" })).toBeNull();
    });

    it('accepts "female"', () => {
      expect(validate({ lastname: "Smith", gender: "female" })).toBeNull();
    });

    it('accepts "M"', () => {
      expect(validate({ lastname: "Smith", gender: "M" })).toBeNull();
    });

    it('accepts "F"', () => {
      expect(validate({ lastname: "Smith", gender: "F" })).toBeNull();
    });

    it('rejects "other"', () => {
      expect(validate({ lastname: "Smith", gender: "other" })).toBe(
        "Invalid gender: must be one of 'male', 'female', 'M', 'F'."
      );
    });

    it("rejects arbitrary string", () => {
      expect(validate({ lastname: "Smith", gender: "xyz" })).toBe(
        "Invalid gender: must be one of 'male', 'female', 'M', 'F'."
      );
    });

    it("rejects empty string", () => {
      expect(validate({ lastname: "Smith", gender: "" })).toBe(
        "Invalid gender: must be one of 'male', 'female', 'M', 'F'."
      );
    });

    it('rejects "MALE" (uppercase)', () => {
      expect(validate({ lastname: "Smith", gender: "MALE" })).toBe(
        "Invalid gender: must be one of 'male', 'female', 'M', 'F'."
      );
    });

    it('rejects "Male" (title case)', () => {
      expect(validate({ lastname: "Smith", gender: "Male" })).toBe(
        "Invalid gender: must be one of 'male', 'female', 'M', 'F'."
      );
    });

    it('rejects "FEMALE" (uppercase)', () => {
      expect(validate({ lastname: "Smith", gender: "FEMALE" })).toBe(
        "Invalid gender: must be one of 'male', 'female', 'M', 'F'."
      );
    });
  });

  // --- Zipcode validation ---

  describe("zipcode", () => {
    it("accepts valid 5 digits", () => {
      expect(validate({ lastname: "Smith", zipcode: "90210" })).toBeNull();
    });

    it("rejects 4 digits", () => {
      expect(validate({ lastname: "Smith", zipcode: "9021" })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });

    it("rejects 6 digits", () => {
      expect(validate({ lastname: "Smith", zipcode: "902100" })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });

    it("rejects ZIP+4 format", () => {
      expect(validate({ lastname: "Smith", zipcode: "90210-1234" })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });

    it("rejects alphabetic characters", () => {
      expect(validate({ lastname: "Smith", zipcode: "abcde" })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });

    it("rejects mixed alphanumeric", () => {
      expect(validate({ lastname: "Smith", zipcode: "90ab0" })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });

    it("rejects empty string", () => {
      expect(validate({ lastname: "Smith", zipcode: "" })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });

    it("accepts leading zeros", () => {
      expect(validate({ lastname: "Smith", zipcode: "01234" })).toBeNull();
    });

    it("rejects leading/trailing whitespace", () => {
      expect(validate({ lastname: "Smith", zipcode: " 90210 " })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });
  });

  // --- Multiple invalid fields / validation ordering ---

  describe("validation ordering", () => {
    it("reports first invalid field (lastname before zipcode)", () => {
      expect(validate({ lastname: "S", zipcode: "abc" })).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });

    it("checks combination rules before field validation", () => {
      expect(validate({ gender: "xyz" })).toBe(
        "At least 'lastname' or 'specialty' must be included as a filter."
      );
    });

    it("reports field error when combination is valid", () => {
      expect(validate({ specialty: "Cardiology", zipcode: "abc" })).toBe(
        "Invalid zipcode: must be exactly 5 digits."
      );
    });

    it("validates lastname first when all fields are invalid", () => {
      expect(
        validate({
          lastname: "S",
          specialty: "X",
          gender: "xyz",
          zipcode: "abc",
        })
      ).toBe(
        "Invalid lastname: must be at least 3 characters, alphabetic and hyphens only."
      );
    });
  });
});
