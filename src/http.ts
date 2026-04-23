/**
 * src/http.ts — HTTP Transport
 *
 * Creates a Node.js HTTP server that handles the MCP Streamable HTTP
 * transport on the /mcp endpoint. Each HTTP session gets an independent
 * MCP Server instance connected to its own StreamableHTTPServerTransport.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";

const transports = new Map<string, StreamableHTTPServerTransport>();

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function sendJsonError(res: ServerResponse, statusCode: number, code: number, message: string): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "";

  if (method !== "POST" && method !== "GET" && method !== "DELETE") {
    sendJsonError(res, 405, -32000, "Method not allowed.");
    return;
  }

  let parsedBody: unknown = undefined;
  if (method === "POST") {
    const raw = await readBody(req);
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      sendJsonError(res, 400, -32700, "Parse error: invalid JSON.");
      return;
    }
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, parsedBody);
    return;
  }

  if (!sessionId && method === "POST" && isInitializeRequest(parsedBody)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid: string) => {
        transports.set(sid, transport);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
    return;
  }

  sendJsonError(res, 400, -32000, "Bad Request: No valid session ID provided.");
}

export function startHttpServer(port: number): HttpServer {
  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/mcp") {
      try {
        await handleMcp(req, res);
      } catch {
        if (!res.headersSent) {
          sendJsonError(res, 500, -32603, "Internal server error.");
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, () => {
    console.error(`HTTP transport listening on port ${port}`);
  });

  return httpServer;
}
