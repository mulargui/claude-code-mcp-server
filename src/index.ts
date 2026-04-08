/**
 * src/index.ts — MCP Server Entry Point
 *
 * Application entry point for the doctor-search MCP server.
 * Opens the database, creates the MCP server, connects stdio
 * transport, and handles graceful shutdown.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDb, closeDb } from "./db.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  openDb();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  async function shutdown(): Promise<void> {
    await server.close();
    closeDb();
  }

  process.on("SIGINT", () => { shutdown(); });
  process.on("SIGTERM", () => { shutdown(); });
}

main();
