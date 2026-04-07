/**
 * src/__tests__/db.test.ts — Database Module Unit Tests
 *
 * Verifies the db module's lifecycle guards (open/close/get) without
 * requiring the actual doctors.db file on disk.
 */
import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";

// db.ts uses a module-level singleton with a hardcoded path to doctors.db.
// These tests verify the module's guard logic without requiring the actual
// database file (which is created later by import-data).

interface DbModule {
  openDb: () => void;
  getDb: () => unknown;
  closeDb: () => void;
}

async function freshDbModule(): Promise<DbModule> {
  vi.resetModules();
  return (await import("../db.js")) as DbModule;
}

describe("db module", () => {
  let mod: DbModule;

  afterEach(() => {
    try {
      mod?.closeDb();
    } catch {
      // already closed or never opened
    }
  });

  it("getDb() throws before openDb() is called", async () => {
    mod = await freshDbModule();
    expect(() => mod.getDb()).toThrow("Database not open");
  });

  it("closeDb() is safe when db was never opened", async () => {
    mod = await freshDbModule();
    expect(() => mod.closeDb()).not.toThrow();
  });

  it("double closeDb() is safe", async () => {
    mod = await freshDbModule();
    // closeDb without open should not throw, even twice
    mod.closeDb();
    expect(() => mod.closeDb()).not.toThrow();
  });
});
