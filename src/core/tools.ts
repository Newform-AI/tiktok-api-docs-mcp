import { FastMCP } from "fastmcp";
import { z } from "zod";
import * as services from "./services/index.js";

/**
 * Register all tools with the MCP server
 * 
 * @param server The FastMCP server instance
 */
export function registerTools(server: FastMCP) {
  // Search tool - required for ChatGPT connectors and deep research
  server.addTool({
    name: "search",
    description: "Search TikTok API documentation for relevant information",
    parameters: z.object({
      query: z.string().describe("Search query string")
    }),
    execute: async (params) => {
      try {
        const results = await services.VectorStoreService.search(params.query);
        // Return as JSON string for MCP compatibility
        return JSON.stringify({
          results: results
        });
      } catch (error) {
        console.error("Search error:", error);
        return JSON.stringify({
          error: error instanceof Error ? error.message : "Search failed",
          results: []
        });
      }
    }
  });

  // Fetch tool - required for ChatGPT connectors and deep research
  server.addTool({
    name: "fetch",
    description: "Fetch the full content of a TikTok API documentation document by ID",
    parameters: z.object({
      id: z.string().describe("Unique identifier for the document")
    }),
    execute: async (params) => {
      try {
        const document = await services.VectorStoreService.fetch(params.id);
        // Return as JSON string for MCP compatibility
        return JSON.stringify(document);
      } catch (error) {
        console.error("Fetch error:", error);
        return JSON.stringify({
          error: error instanceof Error ? error.message : "Fetch failed",
          id: params.id,
          title: "Error",
          text: "Failed to fetch document",
          url: ""
        });
      }
    }
  });

  // Status tool - helpful for debugging
  server.addTool({
    name: "vector_store_status",
    description: "Check the status of the vector store configuration",
    parameters: z.object({}),
    execute: async () => {
      try {
        const status = await services.VectorStoreService.getStatus();
        return JSON.stringify({
          configured: status.configured,
          store_id: status.storeId,
          message: status.configured 
            ? "Vector store is configured and ready" 
            : "Vector store not configured. Please run tikTokDocsToVectorStore.ts first."
        });
      } catch (error) {
        console.error("Status check error:", error);
        return JSON.stringify({
          configured: false,
          error: error instanceof Error ? error.message : "Status check failed"
        });
      }
    }
  });

  // Legacy greeting tools (can be removed if not needed)
  server.addTool({
    name: "hello_world",
    description: "A simple hello world tool",
    parameters: z.object({
      name: z.string().describe("Name to greet")
    }),
    execute: async (params) => {
      const greeting = services.GreetingService.generateGreeting(params.name);
      return greeting;
    }
  });

  server.addTool({
    name: "goodbye",
    description: "A simple goodbye tool",
    parameters: z.object({
      name: z.string().describe("Name to bid farewell to")
    }),
    execute: async (params) => {
      const farewell = services.GreetingService.generateFarewell(params.name);
      return farewell;
    }
  });
}