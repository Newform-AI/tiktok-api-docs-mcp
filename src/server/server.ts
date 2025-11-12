import { FastMCP } from "fastmcp";
import { registerTools } from "../core/tools.js";

// Create and start the MCP server
async function startServer() {
  try {
    // Create a new FastMCP server instance
    const server = new FastMCP({
      name: "TikTok API Docs MCP Server",
      version: "1.0.0",
      authenticate: async (req) => {
        const xff = req.headers["x-forwarded-for"];
        const forwarded = Array.isArray(xff) ? xff[0] : xff;
        const ip = forwarded?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
        const userAgent = req.headers["user-agent"] || "";
        const url = req.url || "";
        console.error("[MCP] Incoming connection request", { ip, userAgent, url });
        return { ip, userAgent, url } as Record<string, unknown>;
      }
    });

    // Register all resources, tools, and prompts
    registerTools(server);
    
    // Log all client connection lifecycle events
    server.on("connect", () => {
      console.error(`[MCP] Client connected. Active sessions: ${server.sessions.length}`);
    });
    server.on("disconnect", () => {
      console.error(`[MCP] Client disconnected. Active sessions: ${server.sessions.length}`);
    });
    
    // Log server information
    console.error(`MCP Server initialized`);
    console.error("Server is ready to handle requests");
    
    return server;
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

// Export the server creation function
export default startServer; 