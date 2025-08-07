# TikTok API Docs MCP Server

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6)

An MCP (Model Context Protocol) server that provides semantic search and retrieval for TikTok API documentation using OpenAI's vector store. Compatible with ChatGPT connectors, deep research, and API integrations.

## 🎯 Purpose

This server enables AI models to search and retrieve TikTok API documentation through the Model Context Protocol. It's designed to work with:
- ChatGPT Connectors for enhanced chat capabilities
- Deep Research models (o4-mini-deep-research)
- Any MCP-compatible client

## ✨ Features

- **Semantic Search**: Search TikTok API documentation using natural language queries
- **Document Retrieval**: Fetch full documentation content by ID
- **Vector Store Integration**: Powered by OpenAI's vector store for accurate semantic search
- **Dual Transport Support**: Run via stdio (local) or SSE/HTTP (remote)
- **ChatGPT Compatible**: Implements the required `search` and `fetch` tools for ChatGPT integration

## 📋 Prerequisites

1. **OpenAI API Key**: Required for vector store operations
2. **Bun Runtime**: This project uses Bun for optimal performance
3. **TikTok Documentation**: Automatically downloaded during setup

## 🚀 Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Set up OpenAI API Key

```bash
export OPENAI_API_KEY=sk-your-api-key-here
```

### 3. Initialize Vector Store with TikTok Docs

```bash
# This downloads TikTok docs and uploads them to OpenAI vector store
bun run src/scripts/tikTokDocsToVectorStore.ts
```

This will:
- Download all TikTok API documentation (~200+ files)
- Create an OpenAI vector store named "TikTok API Documentation"
- Upload and index all documentation
- Save configuration to `tiktok-docs/vector-store-config.json`

### 4. Start the MCP Server

For HTTP/SSE mode (ChatGPT and remote access):
```bash
bun run start:http
```

For stdio mode (local MCP clients):
```bash
bun run start
```

## 🛠️ Available Tools

### `search`
Search TikTok API documentation for relevant information.

**Parameters:**
- `query` (string): Search query

**Returns:**
```json
{
  "results": [
    {
      "id": "file_123",
      "title": "Campaign Management",
      "text": "Relevant snippet...",
      "url": "https://platform.tiktok.com/docs/campaign-management"
    }
  ]
}
```

### `fetch`
Retrieve full content of a documentation file.

**Parameters:**
- `id` (string): File ID from search results

**Returns:**
```json
{
  "id": "file_123",
  "title": "Campaign Management",
  "text": "Full document content...",
  "url": "https://platform.tiktok.com/docs/campaign-management",
  "metadata": {...}
}
```

### `vector_store_status`
Check vector store configuration status.

**Returns:**
```json
{
  "configured": true,
  "store_id": "vs_abc123",
  "message": "Vector store is configured and ready"
}
```

## 🔗 Integration with ChatGPT

### Via ChatGPT Connectors

1. Go to ChatGPT Settings → Connectors
2. Add new MCP server:
   - URL: `https://your-server-url/sse/`
   - Tools: `search`, `fetch`
   - Approval: Set to "never" for deep research

### Via OpenAI API

```bash
curl https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "o4-mini-deep-research",
    "input": [{
      "role": "user",
      "content": [{
        "type": "input_text",
        "text": "How do I create a TikTok ad campaign?"
      }]
    }],
    "tools": [{
      "type": "mcp",
      "server_label": "tiktok-docs",
      "server_url": "http://localhost:3001/sse/",
      "allowed_tools": ["search", "fetch"],
      "require_approval": "never"
    }]
  }'
```

## 📁 Project Structure

```
├── src/
│   ├── core/
│   │   ├── services/
│   │   │   ├── vector-store-service.ts  # OpenAI vector store operations
│   │   │   └── greeting-service.ts      # Legacy example service
│   │   ├── tools.ts                     # MCP tool definitions
│   │   ├── resources.ts                 # MCP resources
│   │   └── prompts.ts                   # MCP prompts
│   ├── scripts/
│   │   ├── tikTokDocsToVectorStore.ts   # Setup script for vector store
│   │   └── getTikTokDocsMd.ts          # TikTok docs downloader
│   ├── server/
│   │   ├── http-server.ts              # SSE/HTTP server
│   │   └── server.ts                    # Core server setup
│   └── index.ts                         # stdio server entry
├── tiktok-docs/                         # Downloaded documentation (gitignored)
│   └── vector-store-config.json        # Vector store configuration
├── MCP_SERVER_README.md                # Detailed MCP server documentation
└── README.md                            # This file
```

## 🧪 Testing

### Test the Server

```bash
# Run the test script
node test-mcp-server.js
```

### Manual Testing

Search for documentation:
```bash
curl -X POST http://localhost:3001/sse/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {"query": "campaign creation"}
    }
  }'
```

## 📝 Scripts

### Vector Store Management

```bash
# Download docs and sync to vector store
bun run src/scripts/tikTokDocsToVectorStore.ts

# Search the vector store
bun run src/scripts/tikTokDocsToVectorStore.ts --search "your query"
```

### Server Commands

```bash
# Production
bun run start          # stdio mode
bun run start:http     # HTTP/SSE mode

# Development (with auto-reload)
bun run dev           # stdio mode
bun run dev:http      # HTTP/SSE mode

# Build
bun run build         # Build stdio server
bun run build:http    # Build HTTP server
```

## 🔧 Configuration

### Environment Variables

```bash
OPENAI_API_KEY=sk-...  # Required: OpenAI API key
PORT=3001              # HTTP server port (default: 3001)
```

### Vector Store Configuration

After running the setup script, configuration is saved to:
```json
{
  "vectorStoreId": "vs_abc123",
  "vectorStoreName": "TikTok API Documentation",
  "lastSync": "2024-01-01T00:00:00Z",
  "filesCount": 200
}
```

## 🚢 Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start the server
pm2 start bun --name "tiktok-mcp" -- run start:http

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "run", "start:http"]
```

## 🔒 Security Considerations

- **API Keys**: Never commit API keys to version control
- **HTTPS**: Use HTTPS in production environments
- **Authentication**: Implement authentication for public deployments
- **Rate Limiting**: Consider implementing rate limiting for API endpoints
- **CORS**: Configure appropriate CORS headers for your use case

## 📚 Documentation

- [MCP Server Documentation](./MCP_SERVER_README.md) - Detailed MCP implementation guide
- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
- [FastMCP Framework](https://github.com/punkpeye/fastmcp) - Framework documentation
- [OpenAI Vector Stores](https://platform.openai.com/docs/guides/retrieval) - Vector store API guide

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [FastMCP](https://github.com/punkpeye/fastmcp)
- Powered by [OpenAI Vector Stores](https://platform.openai.com/docs/guides/retrieval)
- TikTok API documentation from [TikTok for Business](https://business.tiktok.com/)