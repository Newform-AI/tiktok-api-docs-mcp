import startServer from "./server.js";

// Environment variables with default values
const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.RAILWAY_PUBLIC_DOMAIN || "0.0.0.0";
const HTTP_TYPE = process.env.RAILWAY_PUBLIC_DOMAIN ? "https" : "http";

async function main() {
  try {
    // Create and initialize the FastMCP server
    const server = await startServer();
    
    // Start the server with SSE transport
    server.start({
      transportType: "httpStream",
      httpStream: {
        port: PORT,
        host: "0.0.0.0",
      },
    });
    
    console.error(`MCP Server running at ${HTTP_TYPE}://${HOST}:${PORT}`);
    console.error(`SSE endpoint: ${HTTP_TYPE}://${HOST}:${PORT}`);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.error("Shutting down server...");
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
}); 