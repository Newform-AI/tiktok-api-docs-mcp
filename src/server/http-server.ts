import startServer from "./server.js";

// Environment variables with default values
const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function main() {
  try {
    // Create and initialize the FastMCP server
    const server = await startServer();
    
    // Start the server with SSE transport
    server.start({
      transportType: "httpStream",
      httpStream: {
        port: PORT,
      },
    });
    
    console.error(`MCP Server running at http://${HOST}:${PORT}`);
    console.error(`SSE endpoint: http://${HOST}:${PORT}/sse`);
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