import * as fs from "node:fs/promises";
import * as path from "node:path";
import OpenAI from "openai";
import { 
  downloadDocs
} from "./getTikTokDocsMd.js";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface UploadConfig {
  vectorStoreName?: string;
  identifyKey?: string;
  outputDir?: string;
  language?: string;
  maxConcurrent?: number;
  delay?: number;
}

// Helper function to recursively get all markdown files from a directory
async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function traverse(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await traverse(dir);
  return files;
}

// Check if a vector store with the given name exists
async function findVectorStore(name: string): Promise<OpenAI.VectorStores.VectorStore | null> {
  try {
    const stores = await openai.vectorStores.list();
    
    for await (const store of stores) {
      if (store.name === name) {
        return store;
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error listing vector stores:", error);
    return null;
  }
}

// Create or get existing vector store
async function getOrCreateVectorStore(name: string): Promise<OpenAI.VectorStores.VectorStore> {
  console.log(`🔍 Checking for existing vector store: "${name}"...`);
  
  const existingStore = await findVectorStore(name);
  
  if (existingStore) {
    console.log(`✅ Found existing vector store: ${existingStore.id}`);
    return existingStore;
  }
  
  console.log(`📦 Creating new vector store: "${name}"...`);
  const newStore = await openai.vectorStores.create({
    name: name,
  });
  
  console.log(`✅ Created vector store: ${newStore.id}`);
  return newStore;
}

// Upload markdown files to vector store
async function uploadFilesToVectorStore(
  vectorStore: OpenAI.VectorStores.VectorStore,
  markdownFiles: string[]
): Promise<void> {
  console.log(`\n📤 Uploading ${markdownFiles.length} files to vector store...`);
  
  const fileIds: string[] = [];
  
  // First, upload all files to OpenAI
  for (const filePath of markdownFiles) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Create a Blob from the content
      const blob = new Blob([fileContent], { type: 'text/markdown' });
      
      // Create a File object
      const file = new File([blob], fileName, { type: 'text/markdown' });
      
      // Upload file to OpenAI
      console.log(`  📄 Uploading: ${relativePath}`);
      const uploadedFile = await openai.files.create({
        file: file,
        purpose: 'assistants',
      });
      
      fileIds.push(uploadedFile.id);
      console.log(`    ✅ Uploaded: ${fileName} (${uploadedFile.id})`);
    } catch (error) {
      console.error(`    ❌ Failed to upload ${filePath}:`, error);
    }
  }
  
  // Then batch add all files to the vector store
  if (fileIds.length > 0) {
    console.log(`\n📦 Adding ${fileIds.length} files to vector store...`);
    
    try {
      // Use the batch operation for better performance
      const batch = await openai.vectorStores.fileBatches.createAndPoll(
        vectorStore.id, 
        {
          file_ids: fileIds
        }
      );
      
      console.log(`✅ Batch upload complete! Status: ${batch.status}`);
      console.log(`   Files processed: ${batch.file_counts.completed}/${batch.file_counts.total}`);
      
      if (batch.file_counts.failed > 0) {
        console.log(`   ⚠️  Failed files: ${batch.file_counts.failed}`);
      }
    } catch (error) {
      console.error("Error in batch upload:", error);
      
      // Fallback to individual uploads if batch fails
      console.log("Falling back to individual file uploads...");
      for (const fileId of fileIds) {
        try {
          await openai.vectorStores.files.createAndPoll(vectorStore.id, {
            file_id: fileId,
          });
          console.log(`  ✅ Added file ${fileId} to vector store`);
        } catch (err) {
          console.error(`  ❌ Failed to add file ${fileId}:`, err);
        }
      }
    }
  }
  
  console.log(`\n✅ Upload complete!`);
}

// Main function to download docs and upload to vector store
async function syncDocsToVectorStore(config: UploadConfig = {}): Promise<void> {
  const {
    vectorStoreName = "TikTok API Documentation",
    identifyKey = "c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b",
    outputDir = "./tiktok-docs",
    language = "ENGLISH",
    maxConcurrent = 15,
    delay = 500,
  } = config;
  
  try {
    // Check if API key is set
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    
    console.log("🚀 Starting TikTok Docs to Vector Store Sync\n");
    
    // Step 1: Download the documentation
    console.log("📥 Downloading TikTok documentation...\n");
    await downloadDocs({
      identifyKey,
      outputDir,
      language,
      includeMetadata: true,
      maxConcurrent,
      delay,
    });
    
    // Step 2: Get all markdown files
    console.log("\n📂 Finding all markdown files...");
    const markdownFiles = await getAllMarkdownFiles(outputDir);
    console.log(`✅ Found ${markdownFiles.length} markdown files`);
    
    // Step 3: Get or create vector store
    const vectorStore = await getOrCreateVectorStore(vectorStoreName);
    
    // Step 4: Upload files to vector store
    await uploadFilesToVectorStore(vectorStore, markdownFiles);
    
    // Step 5: Display summary
    console.log(`\n${"=".repeat(50)}`);
    console.log("📊 SYNC COMPLETE!");
    console.log("=".repeat(50));
    console.log(`Vector Store ID: ${vectorStore.id}`);
    console.log(`Vector Store Name: ${vectorStore.name}`);
    console.log(`Total Files: ${markdownFiles.length}`);
    console.log(`\nYou can now use this vector store ID in your OpenAI Assistant or API calls.`);
    
    // Save vector store ID for later use
    const configFile = {
      vectorStoreId: vectorStore.id,
      vectorStoreName: vectorStore.name,
      lastSync: new Date().toISOString(),
      filesCount: markdownFiles.length
    };
    
    await fs.writeFile(
      path.join(outputDir, "vector-store-config.json"),
      JSON.stringify(configFile, null, 2),
      "utf-8"
    );
    
    console.log(`\n💾 Vector store config saved to: ${path.join(outputDir, "vector-store-config.json")}`);
    
  } catch (error) {
    console.error("\n❌ Error syncing documentation to vector store:", error);
    throw error;
  }
}

// Function to search the vector store
async function searchVectorStore(
  query: string,
  vectorStoreName: string = "TikTok API Documentation"
): Promise<void> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    
    console.log(`🔍 Searching for: "${query}"\n`);
    
    // Find the vector store
    const vectorStore = await findVectorStore(vectorStoreName);
    
    if (!vectorStore) {
      throw new Error(`Vector store "${vectorStoreName}" not found. Please run the sync first.`);
    }
    
    // Perform the search using the new search API
    const searchResults = await openai.vectorStores.search(vectorStore.id, {
      query: query,
      max_num_results: 5,
      rewrite_query: true,  // Enable query rewriting for better results
    });
    
    console.log("📋 Search Results:\n");
    console.log("=".repeat(50));
    
    /* if (searchResults.search_query && searchResults.search_query !== query) {
      console.log(`🔄 Rewritten query: "${searchResults.search_query}"\n`);
    } */
    
    if (searchResults.data.length === 0) {
      console.log("No results found.");
    } else {
      searchResults.data.forEach((result, index) => {
        console.log(`\n📄 Result ${index + 1}:`);
        console.log(`   File: ${result.filename}`);
        console.log(`   Score: ${(result.score * 100).toFixed(1)}%`);
        
        if (result.attributes && Object.keys(result.attributes).length > 0) {
          console.log(`   Attributes: ${JSON.stringify(result.attributes)}`);
        }
        
        console.log(`   Content:`);
        result.content.forEach(content => {
          if (content.type === 'text') {
            // Truncate long text for display
            const text = content.text.length > 500 
              ? content.text.substring(0, 500) + "..." 
              : content.text;
            console.log(`      ${text}`);
          }
        });
      });
    }
    
    console.log("\n" + "=".repeat(50));
    
    // Optionally synthesize a response
    if (searchResults.data.length > 0) {
      console.log("\n💭 Synthesizing response...\n");
      
      const sources = searchResults.data.map(result => 
        result.content.map(c => c.text).join('\n')
      ).join('\n\n');
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that answers questions based on the provided TikTok API documentation. Provide concise, accurate answers."
          },
          {
            role: "user",
            content: `Based on the following documentation excerpts, please answer this question: "${query}"\n\nDocumentation:\n${sources}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      });
      
      console.log("📝 Answer:");
      console.log(completion.choices[0].message.content);
    }
    
  } catch (error) {
    console.error("❌ Error searching vector store:", error);
    throw error;
  }
}

// Main execution
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
TikTok Docs to Vector Store

This script downloads TikTok API documentation and uploads it to an OpenAI vector store.

Usage:
  bun run src/scripts/tikTokDocsToVectorStore.ts              Download docs and sync to vector store
  bun run src/scripts/tikTokDocsToVectorStore.ts --search "query"    Search the vector store
  bun run src/scripts/tikTokDocsToVectorStore.ts --help             Show this help message

Options:
  --store-name <name>          Vector store name (default: "TikTok API Documentation")
  --output-dir <path>          Output directory for docs (default: ./tiktok-docs)
  --language <lang>            Language (default: ENGLISH)
  --max-concurrent <n>         Max concurrent downloads (default: 15)
  --delay <ms>                 Delay between requests in ms (default: 500)
  --search <query>             Search the vector store instead of syncing

Environment Variables:
  OPENAI_API_KEY               Required: Your OpenAI API key

Examples:
  # Sync documentation to vector store
  OPENAI_API_KEY=sk-... bun run src/scripts/tikTokDocsToVectorStore.ts
  
  # Search for information about campaigns
  OPENAI_API_KEY=sk-... bun run src/scripts/tikTokDocsToVectorStore.ts --search "How do I create a campaign?"
  
  # Use a custom vector store name
  OPENAI_API_KEY=sk-... bun run src/scripts/tikTokDocsToVectorStore.ts --store-name "My TikTok Docs"
`);
    return;
  }
  
  // Parse command line arguments
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index !== -1 && index + 1 < args.length
      ? args[index + 1]
      : undefined;
  };
  
  const searchQuery = getArg("--search");
  
  if (searchQuery) {
    // Search mode
    const storeName = getArg("--store-name") || "TikTok API Documentation";
    await searchVectorStore(searchQuery, storeName);
  } else {
    // Sync mode
    const config: UploadConfig = {
      vectorStoreName: getArg("--store-name") || "TikTok API Documentation",
      outputDir: getArg("--output-dir") || "./tiktok-docs",
      language: getArg("--language") || "ENGLISH",
      maxConcurrent: parseInt(getArg("--max-concurrent") || "15"),
      delay: parseInt(getArg("--delay") || "500"),
    };
    
    await syncDocsToVectorStore(config);
  }
};

// Export functions
export {
  syncDocsToVectorStore,
  searchVectorStore,
  findVectorStore,
  getOrCreateVectorStore,
  uploadFilesToVectorStore,
  getAllMarkdownFiles,
};

// Run if executed directly
if (process.argv[1] === import.meta.url.slice(7)) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}