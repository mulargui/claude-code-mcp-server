/**
 * src/server.ts — MCP Server Setup
 *
 * Creates and configures the MCP server instance, registering
 * the doctor-search tool and wiring up call handling to the
 * validation and search modules.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { validate } from "./validate.js";
import { searchDoctors } from "./search.js";
import type { DoctorSearchInput } from "./types.js";

export function createServer(): Server {
  const server = new Server(
    { name: "doctor-search", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "doctor-search",
        description:
          "Search a US doctor directory by last name, specialty, gender, and/or zip code. " +
          "Returns matching doctor profiles including NPI, name, specialty, address, and phone. " +
          "At least lastname or specialty must be provided. Results are capped at 50. " +
          'Use prefix matching: e.g. lastname "Smi" matches "Smith", specialty "Cardio" matches "Cardiology".',
        inputSchema: {
          type: "object" as const,
          properties: {
            lastname: {
              type: "string",
              description:
                "Filter by doctor's last name (prefix match, minimum 3 characters). Alphabetic characters and hyphens only.",
            },
            specialty: {
              type: "string",
              description:
                "Filter by medical specialty (prefix match, minimum 3 characters). Matches against both classification and specialization. Alphabetic characters, spaces, and hyphens only.",
            },
            gender: {
              type: "string",
              enum: ["male", "female", "M", "F"],
              description: "Filter by gender. Normalized to M/F internally.",
            },
            zipcode: {
              type: "string",
              pattern: "^[0-9]{5}$",
              description: "Filter by 5-digit US zip code (exact match).",
            },
          },
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "doctor-search") {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }

    const input = (request.params.arguments ?? {}) as DoctorSearchInput;
    const error = validate(input);
    if (error) {
      return {
        content: [{ type: "text" as const, text: error }],
        isError: true,
      };
    }

    try {
      const result = searchDoctors(input);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch {
      return {
        content: [
          { type: "text" as const, text: "Internal error: please try again later." },
        ],
        isError: true,
      };
    }
  });

  return server;
}
