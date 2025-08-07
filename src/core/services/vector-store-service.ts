import OpenAI from "openai";
import * as fs from "node:fs/promises";
import * as path from "node:path";

interface SearchResult {
  id: string;
  title: string;
  text: string;
  url: string;
}

interface FetchResult {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata?: Record<string, any>;
}

export class VectorStoreService {
  private static openai: OpenAI | null = null;
  private static vectorStoreId: string | null = null;
  private static fileCache: Map<string, any> = new Map();

  /**
   * Initialize the OpenAI client and vector store
   */
  static async initialize(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Try to load vector store config
    await this.loadVectorStoreConfig();
  }

  /**
   * Load vector store configuration from file
   */
  private static async loadVectorStoreConfig(): Promise<void> {
    try {
      const configPath = path.join(process.cwd(), "tiktok-docs", "vector-store-config.json");
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);
      
      this.vectorStoreId = config.vectorStoreId;
      console.error(`Loaded vector store ID: ${this.vectorStoreId}`);
    } catch (error) {
      // Try to find vector store by name
      await this.findVectorStoreByName();
    }
  }

  /**
   * Find vector store by name
   */
  private static async findVectorStoreByName(): Promise<void> {
    if (!this.openai) {
      throw new Error("OpenAI client not initialized");
    }

    try {
      const stores = await this.openai.vectorStores.list();
      
      for await (const store of stores) {
        if (store.name === "TikTok API Documentation") {
          this.vectorStoreId = store.id;
          console.error(`Found vector store by name: ${this.vectorStoreId}`);
          return;
        }
      }
      
      console.error("Warning: No TikTok API Documentation vector store found. Please run tikTokDocsToVectorStore.ts first.");
    } catch (error) {
      console.error("Error finding vector store:", error);
    }
  }

  /**
   * Search the vector store for relevant documents
   */
  static async search(query: string): Promise<SearchResult[]> {
    if (!this.openai) {
      await this.initialize();
    }

    if (!this.vectorStoreId) {
      throw new Error("Vector store not configured. Please run tikTokDocsToVectorStore.ts first.");
    }

    try {
      // Perform vector store search
      const searchResults = await this.openai!.vectorStores.search(this.vectorStoreId, {
        query: query,
        max_num_results: 10,
        rewrite_query: true,
      });

      // Store file information in cache for fetch operations
      const results: SearchResult[] = [];
      
      for (const result of searchResults.data) {
        const fileId = result.file_id;
        
        // Cache the full result for later fetch
        this.fileCache.set(fileId, result);
        
        // Extract text snippets
        const textSnippets = result.content
          .filter(c => c.type === 'text')
          .map(c => (c as any).text)
          .join('\n')
          .substring(0, 500); // Limit snippet length
        
        results.push({
          id: fileId,
          title: result.filename || `Document ${fileId}`,
          text: textSnippets,
          url: `https://platform.tiktok.com/docs/${result.filename?.replace('.md', '') || fileId}`,
        });
      }

      return results;
    } catch (error) {
      console.error("Error searching vector store:", error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch the full content of a document by ID
   */
  static async fetch(documentId: string): Promise<FetchResult> {
    if (!this.openai) {
      await this.initialize();
    }

    try {
      // First check cache from recent search
      if (this.fileCache.has(documentId)) {
        const cachedResult = this.fileCache.get(documentId);
        
        // Extract full text content
        const fullText = cachedResult.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
        
        return {
          id: documentId,
          title: cachedResult.filename || `Document ${documentId}`,
          text: fullText,
          url: `https://platform.tiktok.com/docs/${cachedResult.filename?.replace('.md', '') || documentId}`,
          metadata: {
            score: cachedResult.score,
            attributes: cachedResult.attributes,
          },
        };
      }

      // If not in cache, try to retrieve the file directly
      const file = await this.openai!.files.retrieve(documentId);
      
      // Download file content
      const fileContent = await this.openai!.files.content(documentId);
      const text = await this.streamToString(fileContent);
      
      return {
        id: documentId,
        title: file.filename || `Document ${documentId}`,
        text: text,
        url: `https://platform.tiktok.com/docs/${file.filename?.replace('.md', '') || documentId}`,
        metadata: {
          created_at: file.created_at,
          bytes: file.bytes,
          purpose: file.purpose,
        },
      };
    } catch (error) {
      console.error("Error fetching document:", error);
      throw new Error(`Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert a stream to string
   */
  private static async streamToString(stream: Response): Promise<string> {
    const chunks: Uint8Array[] = [];
    const reader = stream.body?.getReader();
    
    if (!reader) {
      throw new Error("Unable to read stream");
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    return buffer.toString('utf-8');
  }

  /**
   * Get vector store status
   */
  static async getStatus(): Promise<{ configured: boolean; storeId: string | null }> {
    if (!this.vectorStoreId) {
      await this.initialize();
    }

    return {
      configured: !!this.vectorStoreId,
      storeId: this.vectorStoreId,
    };
  }
}

// Initialize on module load
VectorStoreService.initialize().catch(console.error);