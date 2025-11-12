import type { FastMCP } from "fastmcp";
import { z } from "zod";
import * as services from "./services/index.js";

/**
 * Register all tools with the MCP server
 * 
 * @param server The FastMCP server instance
 */
export function registerTools<T extends Record<string, unknown> | undefined>(server: FastMCP<T>) {
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

  // Paginated fetch tool - allows clients to retrieve large documents in chunks
  server.addTool({
    name: "fetch_paginated",
    description: "Fetch a TikTok API documentation document by ID with pagination support for large files",
    parameters: z.object({
      id: z.string().describe("Unique identifier for the document"),
      cursor: z.union([z.number(), z.string()]).optional().describe("Character offset to start reading from (defaults to 0)"),
      max_tokens: z.union([z.number(), z.string()]).optional().describe("Approximate maximum number of tokens per chunk (defaults to 20000)")
    }),
    execute: async (params) => {
      try {
        const rawCursor = params.cursor !== undefined ? Number(params.cursor) : undefined;
        const cursor = rawCursor !== undefined && Number.isFinite(rawCursor) ? rawCursor : undefined;
        const rawMaxTokens = params.max_tokens !== undefined ? Number(params.max_tokens) : undefined;
        const maxTokens = rawMaxTokens !== undefined && Number.isFinite(rawMaxTokens) ? rawMaxTokens : undefined;

        const paginated = await services.VectorStoreService.fetchPaginated(params.id, {
          cursor,
          maxTokens,
        });

        return JSON.stringify(paginated);
      } catch (error) {
        console.error("Paginated fetch error:", error);
        return JSON.stringify({
          error: error instanceof Error ? error.message : "Paginated fetch failed",
          id: params.id,
          cursor: params.cursor ?? 0,
          max_tokens: params.max_tokens ?? 20000,
          chunk: "",
          hasMore: false,
          nextCursor: null,
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

}