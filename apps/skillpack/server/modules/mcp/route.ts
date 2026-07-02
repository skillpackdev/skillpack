import { StreamableHTTPTransport } from "@hono/mcp";
import type { AppBindings } from "@server/types";
import { Hono } from "hono";

import { createMcpServer } from "./server";

export const mcpRoute = new Hono<AppBindings>()
  .post("/", async (c) => {
    const server = createMcpServer({
      currentUser: c.var.currentUser,
      skillService: c.var.skillService,
    });
    const transport = new StreamableHTTPTransport({
      enableJsonResponse: true,
      strictAcceptHeader: false,
    });

    await server.connect(transport);

    return await transport.handleRequest(c);
  })
  .all("/", (c) => {
    c.header("Allow", "POST");
    return c.json({ error: "Method Not Allowed" }, 405);
  });
