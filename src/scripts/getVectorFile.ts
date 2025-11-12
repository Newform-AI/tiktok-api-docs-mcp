import "dotenv/config";
import { VectorStoreService } from "../core/services/vector-store-service.js";

async function main() {
  const documentId = process.argv[2];

  if (!documentId) {
    console.error("Usage: bun run src/scripts/getVectorFile.ts <document-id>");
    process.exit(1);
  }

  try {
    await VectorStoreService.initialize();
    const result = await VectorStoreService.fetch(documentId);
    console.log(result.text);
  } catch (error) {
    console.error("Failed to fetch document from vector store:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

