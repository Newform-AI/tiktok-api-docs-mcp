import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import OpenAI from "openai";
import { downloadDocs } from "./getTikTokDocsMd.js";
import {
  getOrCreateVectorStore,
  getAllMarkdownFiles,
} from "./tikTokDocsToVectorStore.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VECTOR_STORE_NAME = "TikTok API Documentation";
const OUTPUT_DIR = "./tiktok-docs";
const MANIFEST_PATH = "./vector-store-manifest.json";

interface ManifestEntry {
  fileId: string;
  sha256: string;
}

interface Manifest {
  vectorStoreId: string;
  vectorStoreName: string;
  lastSync: string;
  files: Record<string, ManifestEntry>;
}

const sha256 = (data: Buffer | string): string =>
  crypto.createHash("sha256").update(data).digest("hex");

// Map a repo-relative path (e.g. "api/v2/post/Publishing.md") to a unique, flat
// filename that OpenAI will preserve on upload. We do this so future incremental
// runs can unambiguously match local files to store entries (the old sync used
// basename only, which collided across directories).
const relPathToUploadName = (relPath: string): string =>
  relPath.replace(/[\\/]+/g, "__");

async function loadManifest(): Promise<Manifest | null> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw) as Manifest;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

async function listStoreFiles(vectorStoreId: string): Promise<
  Array<{ fileId: string; filename: string }>
> {
  const results: Array<{ fileId: string; filename: string }> = [];
  for await (const vsFile of openai.vectorStores.files.list(vectorStoreId)) {
    const meta = await openai.files.retrieve(vsFile.id);
    results.push({ fileId: vsFile.id, filename: meta.filename });
  }
  return results;
}

// Bootstrap the manifest from an existing store that was built with the old
// basename-only upload scheme. Content download isn't allowed for files uploaded
// with purpose:"assistants", so we match on filename instead:
//   - basename matches 1:1 local↔store → trust, record local hash
//   - basename collides in either set → orphan all matching store fileIds,
//     treat local files as new uploads (forces re-embed for that cluster only)
async function bootstrapManifest(
  vectorStoreId: string,
  localFiles: Map<string, Buffer>,
): Promise<Manifest> {
  console.log("📋 No manifest found — bootstrapping from existing vector store...");

  const storeFiles = await listStoreFiles(vectorStoreId);
  console.log(`   Found ${storeFiles.length} files in store.`);

  // Group store by basename
  const storeByName = new Map<string, string[]>();
  for (const { fileId, filename } of storeFiles) {
    const list = storeByName.get(filename) ?? [];
    list.push(fileId);
    storeByName.set(filename, list);
  }

  // Group local by basename
  const localByBasename = new Map<string, string[]>();
  for (const relPath of localFiles.keys()) {
    const base = path.basename(relPath);
    const list = localByBasename.get(base) ?? [];
    list.push(relPath);
    localByBasename.set(base, list);
  }

  const files: Record<string, ManifestEntry> = {};
  let trusted = 0;
  let ambiguous = 0;
  let orphanOnly = 0;

  const allBasenames = new Set<string>([
    ...storeByName.keys(),
    ...localByBasename.keys(),
  ]);

  for (const base of allBasenames) {
    const storeIds = storeByName.get(base) ?? [];
    const localPaths = localByBasename.get(base) ?? [];

    if (storeIds.length === 1 && localPaths.length === 1) {
      // Unambiguous: trust filename match, compute local hash
      const relPath = localPaths[0];
      const content = localFiles.get(relPath)!;
      files[relPath] = { fileId: storeIds[0], sha256: sha256(content) };
      trusted++;
    } else if (storeIds.length === 0 && localPaths.length > 0) {
      // Local-only basename — will be uploaded on diff
    } else if (storeIds.length > 0 && localPaths.length === 0) {
      // Store-only basename — all orphaned, deleted on diff
      for (let i = 0; i < storeIds.length; i++) {
        files[`__orphan__/${base}#${i}`] = { fileId: storeIds[i], sha256: "" };
      }
      orphanOnly += storeIds.length;
    } else {
      // Ambiguous collision (both sides have >=1, at least one side >1).
      // Mark all store fileIds as orphans so they get deleted and re-uploaded.
      for (let i = 0; i < storeIds.length; i++) {
        files[`__orphan__/${base}#${i}`] = { fileId: storeIds[i], sha256: "" };
      }
      ambiguous += storeIds.length;
      // Local paths stay out of manifest → treated as new uploads on diff.
    }
  }

  console.log(`   Trusted (1:1 match): ${trusted}`);
  console.log(`   Ambiguous basename collisions: ${ambiguous} (will be re-embedded)`);
  console.log(`   Store orphans (not in local): ${orphanOnly} (will be deleted)`);

  const manifest: Manifest = {
    vectorStoreId,
    vectorStoreName: VECTOR_STORE_NAME,
    lastSync: new Date(0).toISOString(),
    files,
  };

  await saveManifest(manifest);
  console.log(`✅ Manifest bootstrapped.`);
  return manifest;
}

async function uploadAndAttach(
  vectorStoreId: string,
  relPath: string,
  content: Buffer,
): Promise<string> {
  const filename = relPathToUploadName(relPath);
  const blob = new Blob([new Uint8Array(content)], { type: "text/markdown" });
  const file = new File([blob], filename, { type: "text/markdown" });
  // user_data is downloadable → future bootstraps can verify content hashes.
  const uploaded = await openai.files.create({ file, purpose: "user_data" });
  await openai.vectorStores.files.createAndPoll(vectorStoreId, {
    file_id: uploaded.id,
  });
  return uploaded.id;
}

async function deleteFromStore(vectorStoreId: string, fileId: string): Promise<void> {
  try {
    await openai.vectorStores.files.delete(fileId, { vector_store_id: vectorStoreId });
  } catch (err) {
    console.error(`   ⚠️  Failed to detach ${fileId} from store:`, err);
  }
  try {
    await openai.files.delete(fileId);
  } catch (err) {
    console.error(`   ⚠️  Failed to delete file ${fileId}:`, err);
  }
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  console.log("🚀 Incremental sync: TikTok docs → OpenAI vector store\n");

  console.log("📥 Downloading TikTok documentation...");
  await downloadDocs({
    identifyKey: "c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b",
    outputDir: OUTPUT_DIR,
    language: "ENGLISH",
    includeMetadata: true,
    maxConcurrent: 15,
    delay: 500,
  });

  console.log("\n📂 Hashing local files...");
  const markdownFiles = await getAllMarkdownFiles(OUTPUT_DIR);
  const localFiles = new Map<string, Buffer>();
  const localHashes = new Map<string, string>();
  for (const absPath of markdownFiles) {
    const content = await fs.readFile(absPath);
    const relPath = path.relative(OUTPUT_DIR, absPath);
    localFiles.set(relPath, content);
    localHashes.set(relPath, sha256(content));
  }
  console.log(`   Hashed ${localFiles.size} files.`);

  const vectorStore = await getOrCreateVectorStore(VECTOR_STORE_NAME);

  let manifest = await loadManifest();
  if (!manifest) {
    manifest = await bootstrapManifest(vectorStore.id, localFiles);
  } else if (manifest.vectorStoreId !== vectorStore.id) {
    console.log(
      `⚠️  Manifest vectorStoreId (${manifest.vectorStoreId}) != current (${vectorStore.id}). Rebootstrapping.`,
    );
    manifest = await bootstrapManifest(vectorStore.id, localFiles);
  }

  const toUpload: string[] = [];
  const toReplace: Array<{ relPath: string; oldFileId: string }> = [];
  const toDelete: Array<{ relPath: string; fileId: string }> = [];
  const unchanged: string[] = [];

  for (const [relPath, hash] of localHashes) {
    const entry = manifest.files[relPath];
    if (!entry) {
      toUpload.push(relPath);
    } else if (entry.sha256 !== hash) {
      toReplace.push({ relPath, oldFileId: entry.fileId });
    } else {
      unchanged.push(relPath);
    }
  }

  for (const [relPath, entry] of Object.entries(manifest.files)) {
    if (relPath.startsWith("__orphan__/") || !localHashes.has(relPath)) {
      toDelete.push({ relPath, fileId: entry.fileId });
    }
  }

  console.log("\n📊 Diff:");
  console.log(`   Unchanged: ${unchanged.length}`);
  console.log(`   To upload (new): ${toUpload.length}`);
  console.log(`   To replace (changed): ${toReplace.length}`);
  console.log(`   To delete (gone/orphan): ${toDelete.length}`);

  if (toUpload.length === 0 && toReplace.length === 0 && toDelete.length === 0) {
    console.log("\n✅ Nothing to do — store is up to date.");
    manifest.lastSync = new Date().toISOString();
    await saveManifest(manifest);
    return;
  }

  for (const { relPath, fileId } of toDelete) {
    console.log(`  🗑️  Delete: ${relPath} (${fileId})`);
    await deleteFromStore(vectorStore.id, fileId);
    delete manifest.files[relPath];
  }

  for (const { relPath, oldFileId } of toReplace) {
    console.log(`  🔄 Replace: ${relPath}`);
    await deleteFromStore(vectorStore.id, oldFileId);
    const content = localFiles.get(relPath)!;
    const newId = await uploadAndAttach(vectorStore.id, relPath, content);
    manifest.files[relPath] = { fileId: newId, sha256: localHashes.get(relPath)! };
    await saveManifest(manifest);
  }

  for (const relPath of toUpload) {
    console.log(`  ⬆️  Upload: ${relPath}`);
    const content = localFiles.get(relPath)!;
    const newId = await uploadAndAttach(vectorStore.id, relPath, content);
    manifest.files[relPath] = { fileId: newId, sha256: localHashes.get(relPath)! };
    await saveManifest(manifest);
  }

  manifest.lastSync = new Date().toISOString();
  await saveManifest(manifest);

  console.log("\n" + "=".repeat(50));
  console.log("✅ Incremental sync complete!");
  console.log(`   Vector Store: ${vectorStore.id}`);
  console.log(`   Manifest: ${MANIFEST_PATH}`);
  console.log(`   Total files tracked: ${Object.keys(manifest.files).length}`);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
