/**
 * vitest.config.ts — Test Runner Configuration
 *
 * Configures Vitest to discover test files in __tests__ directories.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts"],
  },
});
