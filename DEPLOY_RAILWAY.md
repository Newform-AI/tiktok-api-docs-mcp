# Deploy to Railway

This guide will help you deploy the TikTok API Docs MCP Server to Railway.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **OpenAI API Key**: You'll need this as an environment variable
3. **Vector Store Setup**: Run the setup locally first to create the vector store

## Deployment Steps

### Option 1: Deploy from GitHub (Recommended)

1. **Go to Railway Dashboard**
   - Visit [railway.app/new](https://railway.app/new)

2. **Deploy from GitHub Repo**
   - Click "Deploy from GitHub repo"
   - Select `Newform-AI/tiktok-api-docs-mcp`
   - Railway will automatically detect the configuration

3. **Configure Environment Variables**
   - Click on the deployed service
   - Go to "Variables" tab
   - Add the following:
     ```
     OPENAI_API_KEY=sk-your-api-key-here
     PORT=3000
     HOST=0.0.0.0
     ```

4. **Deploy**
   - Railway will automatically build and deploy
   - The deployment uses Bun runtime as configured in `nixpacks.toml`

### Option 2: Deploy via CLI

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Create New Project**
   ```bash
   railway init -n tiktok-api-docs-mcp
   ```

4. **Set Environment Variables**
   ```bash
   railway variables set OPENAI_API_KEY=sk-your-api-key-here
   railway variables set PORT=3000
   railway variables set HOST=0.0.0.0
   ```

5. **Deploy**
   ```bash
   railway up
   ```

## Post-Deployment

### Get Your Server URL

After deployment, Railway will provide you with a URL like:
```
https://tiktok-api-docs-mcp.up.railway.app
```

Your MCP SSE endpoint will be:
```
https://tiktok-api-docs-mcp.up.railway.app/sse/
```

### Test the Deployment

```bash
curl https://your-app.up.railway.app/sse/
```

### Use with ChatGPT

1. Go to ChatGPT Settings → Connectors
2. Add your Railway URL: `https://your-app.up.railway.app/sse/`
3. Configure tools: `search`, `fetch`

## Important Notes

- **Vector Store**: The vector store ID is loaded from your OpenAI account
- **Costs**: Railway offers $5 free credits monthly
- **Scaling**: Railway automatically handles scaling
- **Logs**: View logs in Railway dashboard or via `railway logs`

## Troubleshooting

### Server Not Starting
- Check environment variables are set correctly
- Verify OPENAI_API_KEY is valid
- Check Railway logs: `railway logs`

### Vector Store Not Found
- Ensure you ran the setup script locally first:
  ```bash
  OPENAI_API_KEY=sk-... bun run src/scripts/tikTokDocsToVectorStore.ts
  ```
- The vector store name must be "TikTok API Documentation"

### Connection Issues
- Ensure the URL includes `/sse/` at the end
- Check Railway service is running
- Verify no CORS issues (server allows all origins by default)

## Custom Domain (Optional)

You can add a custom domain in Railway:
1. Go to Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| OPENAI_API_KEY | OpenAI API key for vector store | Yes | - |
| PORT | Server port (Railway sets this) | No | 3001 |
| HOST | Host binding | No | 0.0.0.0 |

## Support

For issues specific to:
- **This MCP Server**: [GitHub Issues](https://github.com/Newform-AI/tiktok-api-docs-mcp/issues)
- **Railway Platform**: [Railway Discord](https://discord.gg/railway)