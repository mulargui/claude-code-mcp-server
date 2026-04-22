/**
 * src/__tests__/server.test.ts — MCP Server Unit Tests
 *
 * Tests the MCP server wiring: tool listing, call handling,
 * validation error forwarding, and internal error handling.
 * Uses in-memory transports with a real MCP Client to exercise
 * the server through the protocol layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

vi.mock("../validate.js", () => ({
  validate: vi.fn(() => null),
}));

vi.mock("../search.js", () => ({
  searchDoctors: vi.fn(() => ({
    total_count: 1,
    doctors: [
      {
        npi: "1234567890",
        lastname: "Smith",
        firstname: "John",
        specialty: "Internal Medicine",
        gender: "M",
        address: "123 Main St",
        city: "Los Angeles",
        zipcode: "90210",
        phone: "3105551234",
      },
    ],
  })),
  listSpecialties: vi.fn(() => ({
    specialties: ["Cardiology", "Internal Medicine", "Pediatrics"],
  })),
}));

import { createServer } from "../server.js";
import { validate } from "../validate.js";
import { searchDoctors, listSpecialties } from "../search.js";

const mockValidate = vi.mocked(validate);
const mockSearchDoctors = vi.mocked(searchDoctors);
const mockListSpecialties = vi.mocked(listSpecialties);

describe("createServer", () => {
  let server: Server;
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = createServer();
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  describe("tools/list", () => {
    it("returns both tools", async () => {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(2);
      const names = result.tools.map((t) => t.name);
      expect(names).toContain("doctor-search");
      expect(names).toContain("specialty-list");
    });

    it("specialty-list has correct input schema", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "specialty-list");
      expect(tool).toBeDefined();
      const schema = tool!.inputSchema;
      expect(schema.type).toBe("object");
      expect(schema.properties).toEqual({});
      expect(
        (schema as Record<string, unknown>).additionalProperties
      ).toBe(false);
    });

    it("includes the correct input schema", async () => {
      const result = await client.listTools();
      const schema = result.tools[0].inputSchema;
      expect(schema.type).toBe("object");
      expect(schema.properties).toHaveProperty("lastname");
      expect(schema.properties).toHaveProperty("specialty");
      expect(schema.properties).toHaveProperty("gender");
      expect(schema.properties).toHaveProperty("zipcode");
      expect((schema as Record<string, unknown>).additionalProperties).toBe(false);
    });
  });

  describe("tools/call", () => {
    it("returns search results on valid input", async () => {
      const result = await client.callTool({
        name: "doctor-search",
        arguments: { lastname: "Smith" },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.total_count).toBe(1);
      expect(parsed.doctors[0].lastname).toBe("Smith");
    });

    it("passes input to validate and searchDoctors", async () => {
      await client.callTool({
        name: "doctor-search",
        arguments: { lastname: "Smith", zipcode: "90210" },
      });

      expect(mockValidate).toHaveBeenCalledWith({
        lastname: "Smith",
        zipcode: "90210",
      });
      expect(mockSearchDoctors).toHaveBeenCalledWith({
        lastname: "Smith",
        zipcode: "90210",
      });
    });

    it("returns validation error with isError flag", async () => {
      mockValidate.mockReturnValueOnce("At least one filter is required.");

      const result = await client.callTool({
        name: "doctor-search",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toBe("At least one filter is required.");
      expect(mockSearchDoctors).not.toHaveBeenCalled();
    });

    it("returns internal error when searchDoctors throws", async () => {
      mockSearchDoctors.mockImplementationOnce(() => {
        throw new Error("DB unavailable");
      });

      const result = await client.callTool({
        name: "doctor-search",
        arguments: { lastname: "Smith" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toBe("Internal error: please try again later.");
    });

    it("returns error for unknown tool name", async () => {
      const result = await client.callTool({
        name: "unknown-tool",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toBe("Unknown tool: unknown-tool");
    });

    it("handles empty arguments as empty object", async () => {
      mockValidate.mockReturnValueOnce("At least one filter is required.");

      await client.callTool({
        name: "doctor-search",
        arguments: {},
      });

      expect(mockValidate).toHaveBeenCalledWith({});
    });
  });

  describe("tools/call specialty-list", () => {
    it("returns specialty list on valid call", async () => {
      const result = await client.callTool({
        name: "specialty-list",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.specialties).toEqual(["Cardiology", "Internal Medicine", "Pediatrics"]);
    });

    it("calls listSpecialties", async () => {
      await client.callTool({
        name: "specialty-list",
        arguments: {},
      });

      expect(mockListSpecialties).toHaveBeenCalled();
    });

    it("does not call validate or searchDoctors", async () => {
      await client.callTool({
        name: "specialty-list",
        arguments: {},
      });

      expect(mockValidate).not.toHaveBeenCalled();
      expect(mockSearchDoctors).not.toHaveBeenCalled();
    });

    it("returns internal error when listSpecialties throws", async () => {
      mockListSpecialties.mockImplementationOnce(() => {
        throw new Error("DB unavailable");
      });

      const result = await client.callTool({
        name: "specialty-list",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toBe("Internal error: please try again later.");
    });
  });
});
