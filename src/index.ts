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
  console.error("doctor-search-mcp server started");

  async function shutdown(): Promise<void> {
    await server.close();
    closeDb();
    process.exit(0);
  }

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
