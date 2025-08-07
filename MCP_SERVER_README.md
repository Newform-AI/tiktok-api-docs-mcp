# TikTok API Docs MCP Server

This MCP (Model Context Protocol) server provides access to TikTok API documentation through OpenAI's vector store, compatible with ChatGPT connectors and deep research.

## Features

- **Search**: Search TikTok API documentation for relevant information
- **Fetch**: Retrieve full document content by ID
- **Vector Store Integration**: Uses OpenAI's vector store for semantic search

## Prerequisites

1. **OpenAI API Key**: Set the `OPENAI_API_KEY` environment variable
2. **Vector Store**: Run the setup script to create and populate the vector store with TikTok documentation

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Set up the Vector Store

First, you need to populate the OpenAI vector store with TikTok documentation:

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=sk-...

# Download TikTok docs and upload to vector store
bun run src/scripts/tikTokDocsToVectorStore.ts
```

This will:
- Download all TikTok API documentation
- Create a vector store named "TikTok API Documentation"
- Upload all documentation files to the vector store
- Save configuration to `tiktok-docs/vector-store-config.json`

### 3. Start the MCP Server

#### For SSE/HTTP (for ChatGPT and API integrations):

```bash
# Start the server on port 3001 (default)
bun run start:http

# Or with custom port
PORT=8080 bun run start:http
```

The server will be available at:
- Base URL: `http://localhost:3001`
- SSE Endpoint: `http://localhost:3001/sse/`

#### For stdio (for local MCP clients):

```bash
bun run start
```

## Available Tools

### 1. `search`
Search TikTok API documentation for relevant information.

**Parameters:**
- `query` (string): Search query string

**Returns:**
```json
{
  "results": [
    {
      "id": "file_123",
      "title": "Campaign Management",
      "text": "Snippet of relevant content...",
      "url": "https://platform.tiktok.com/docs/campaign-management"
    }
  ]
}
```

### 2. `fetch`
Fetch the full content of a TikTok API documentation document by ID.

**Parameters:**
- `id` (string): Unique identifier for the document (file ID from search results)

**Returns:**
```json
{
  "id": "file_123",
  "title": "Campaign Management",
  "text": "Full document content...",
  "url": "https://platform.tiktok.com/docs/campaign-management",
  "metadata": {
    "score": 0.85,
    "attributes": {}
  }
}
```

### 3. `vector_store_status`
Check the status of the vector store configuration.

**Parameters:** None

**Returns:**
```json
{
  "configured": true,
  "store_id": "vs_abc123",
  "message": "Vector store is configured and ready"
}
```

## Using with ChatGPT

### In ChatGPT Connectors:

1. Go to ChatGPT Settings → Connectors
2. Add a new MCP server with URL: `https://your-server-url/sse/`
3. Configure tools: `search`, `fetch`
4. Set approval to "never" for deep research

### Via API for Deep Research:

```bash
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
  "model": "o4-mini-deep-research",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "How do I create a TikTok ad campaign?"
        }
      ]
    }
  ],
  "tools": [
    {
      "type": "mcp",
      "server_label": "tiktok-docs",
      "server_url": "https://your-server-url/sse/",
      "allowed_tools": ["search", "fetch"],
      "require_approval": "never"
    }
  ]
}'
```

## Testing

### Test Search:

```bash
# Using curl
curl -X POST http://localhost:3001/sse/ \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {
        "query": "campaign creation"
      }
    }
  }'
```

### Test Fetch:

```bash
# Use a file ID from search results
curl -X POST http://localhost:3001/sse/ \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "fetch",
      "arguments": {
        "id": "file_abc123"
      }
    }
  }'
```

## Deployment

For production deployment:

1. **Environment Variables:**
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `PORT`: Server port (default: 3001)

2. **Security Considerations:**
   - Use HTTPS in production
   - Implement authentication if needed
   - Set appropriate CORS headers
   - Rate limit API requests

3. **Example with PM2:**
   ```bash
   pm2 start bun --name "mcp-server" -- run start:http
   ```

## Troubleshooting

### Vector Store Not Found

If you see "Vector store not configured" errors:

1. Check that `OPENAI_API_KEY` is set correctly
2. Run the setup script: `bun run src/scripts/tikTokDocsToVectorStore.ts`
3. Verify `tiktok-docs/vector-store-config.json` exists

### Search Returns No Results

1. Verify the vector store has been populated with documents
2. Try broader search terms
3. Check OpenAI API quota and limits

### Connection Issues

1. Ensure the server is running on the correct port
2. Check firewall settings
3. Verify the SSE endpoint URL includes trailing slash: `/sse/`

## Development

### Project Structure

```
src/
├── core/
│   ├── services/
│   │   ├── vector-store-service.ts  # Vector store operations
│   │   └── index.ts
│   └── tools.ts                     # MCP tool definitions
├── scripts/
│   └── tikTokDocsToVectorStore.ts   # Setup script
└── server/
    ├── http-server.ts                # SSE/HTTP server
    └── server.ts                     # Core server setup
```

### Adding New Tools

Edit `src/core/tools.ts` to add new tools following the MCP specification.

## License

MIT