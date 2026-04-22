/**
 * src/server.ts — MCP Server Setup
 *
 * Creates and configures the MCP server instance, registering
 * the doctor-search and specialty-list tools and wiring up call
 * handling to the validation and search modules.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { validate } from "./validate.js";
import { searchDoctors, listSpecialties } from "./search.js";
import type { DoctorSearchInput } from "./types.js";

export function createServer(): Server {
  const server = new Server(
    { name: "doctor-search", version: "1.1.0" },
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
      {
        name: "specialty-list",
        description:
          "List all available medical specialties in the doctor directory. " +
          "Returns an alphabetically sorted list of distinct specialty names. " +
          "Use this to discover valid specialty values before searching with doctor-search.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;

    if (toolName === "specialty-list") {
      try {
        const result = listSpecialties();
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
    }

    if (toolName !== "doctor-search") {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const raw = request.params.arguments ?? {};
    const input: DoctorSearchInput = {};
    for (const key of ["lastname", "specialty", "gender", "zipcode"] as const) {
      if (key in raw && typeof raw[key] === "string") {
        input[key] = raw[key] as string;
      } else if (key in raw) {
        return {
          content: [{ type: "text" as const, text: `Invalid ${key}: must be a string.` }],
          isError: true,
        };
      }
    }
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
