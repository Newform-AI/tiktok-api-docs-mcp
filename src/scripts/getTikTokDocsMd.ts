import * as fs from "node:fs/promises";
import * as path from "node:path";

// Types
interface DocNode {
  doc_id: number;
  title: string;
  parent_id: number;
  status: boolean;
  type: string;
  child_docs: DocNode[];
  is_expand?: boolean;
  status_map?: Record<string, number>;
}

interface TreeResponse {
  code: number;
  msg: string;
  data: {
    main_language: string;
    doc_platform_name: string;
    is_multi_language: boolean;
    identify_key: string;
    view_type: string;
    primary_doc_list: DocNode[];
  };
}

interface NodeResponse {
  code: number;
  msg: string;
  data: {
    title: string;
    content: string;
  };
}

interface DownloadConfig {
  identifyKey?: string;
  outputDir?: string;
  language?: string;
  includeMetadata?: boolean;
  maxConcurrent?: number;
  delay?: number;
}

// Utility functions
const sanitizeFilename = (filename: string): string => {
  // Remove or replace characters that are invalid in filenames
  return filename
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .substring(0, 255); // Limit filename length
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Create directory recursively
const ensureDir = async (dirPath: string): Promise<void> => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
};

// Fetch documentation tree
const fetchDocTree = async (
  identifyKey: string,
  language = "ENGLISH",
): Promise<TreeResponse> => {
  const url =
    "https://business-api.tiktok.com/gateway/api/doc/client/platform/tree/get/";
  const params = {
    language,
    identify_key: identifyKey,
    is_need_content: "false",
  };

  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${url}?${queryString}`);

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`API returned error: ${data.msg}`);
    }

    return data;
  } catch (error) {
    throw error;
  }
};

// Fetch individual document content
const fetchDocContent = async (
  docId: number,
  identifyKey: string,
  language = "ENGLISH",
): Promise<NodeResponse> => {
  const url =
    "https://business-api.tiktok.com/gateway/api/doc/client/node/get/";
  const params = {
    language,
    identify_key: identifyKey,
    doc_id: docId.toString(),
  };

  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${url}?${queryString}`);

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(
        `API returned error for doc ${docId}: ${data.msg}`,
      );
    }

    return data;
  } catch (error) {
    console.error(`Failed to fetch content for doc ${docId}: ${error}`);
      // Return empty content instead of throwing to continue with other docs
      return {
        code: 0,
        msg: "error",
        data: {
          title: `Error loading doc ${docId}`,
          content: `Failed to load content: ${error}`,
        },
      };
  }
};

// Process a single document node
const processDocNode = async (
  node: DocNode,
  parentPath: string,
  identifyKey: string,
  language: string,
  includeMetadata: boolean,
  delay: number,
  depth = 0,
  breadcrumbs: string[] = [], // Add breadcrumbs parameter to track parent hierarchy
): Promise<void> => {
  const indent = "  ".repeat(depth);
  console.log(`${indent}📄 Processing: ${node.title} (ID: ${node.doc_id})`);

  // Create directory for this node if it has children
  const nodeDirName = sanitizeFilename(node.title);
  const nodePath = path.join(parentPath, nodeDirName);

  if (node.child_docs && node.child_docs.length > 0) {
    await ensureDir(nodePath);
  }

  // Fetch and save the content for this node
  if (node.type === "MARKDOWN") {
    await sleep(delay); // Rate limiting

    const content = await fetchDocContent(node.doc_id, identifyKey, language);

    // Determine the file path
    const filePath =
      node.child_docs && node.child_docs.length > 0
        ? path.join(nodePath, "index.md")
        : path.join(parentPath, `${nodeDirName}.md`);

    // Prepare file content
    let fileContent = "";

    if (includeMetadata) {
      fileContent += "---\n";
      fileContent += `title: ${content.data.title}\n`;
      fileContent += `doc_id: ${node.doc_id}\n`;
      fileContent += `parent_id: ${node.parent_id}\n`;
      fileContent += `type: ${node.type}\n`;
      fileContent += `status: ${node.status}\n`;
      // Add breadcrumb path to metadata
      if (breadcrumbs.length > 0) {
        fileContent += `breadcrumbs:\n`;
        for (const crumb of breadcrumbs) {
          fileContent += `  - "${crumb}"\n`;
        }
        fileContent += `full_path: "${breadcrumbs.join(' > ')} > ${content.data.title}"\n`;
      } else {
        fileContent += `full_path: "${content.data.title}"\n`;
      }
      fileContent += "---\n\n";
    }

    // Add breadcrumb navigation to content
    if (breadcrumbs.length > 0) {
      fileContent += "## Navigation\n\n";
      fileContent += "**Path:** ";
      fileContent += breadcrumbs.map(crumb => `\`${crumb}\``).join(" → ");
      fileContent += ` → **${content.data.title}**\n\n`;
      fileContent += "---\n\n";
    }

    fileContent += `# ${content.data.title}\n\n`;
    fileContent += content.data.content;

    // Save the file
    await fs.writeFile(filePath, fileContent, "utf-8");
    console.log(`${indent}  ✅ Saved: ${filePath}`);
  }

  // Process child documents
  if (node.child_docs && node.child_docs.length > 0) {
    const childPath = node.child_docs.length > 0 ? nodePath : parentPath;
    // Create new breadcrumbs array including current node
    const newBreadcrumbs = [...breadcrumbs, node.title];
    
    for (const child of node.child_docs) {
      await processDocNode(
        child,
        childPath,
        identifyKey,
        language,
        includeMetadata,
        delay,
        depth + 1,
        newBreadcrumbs, // Pass updated breadcrumbs to children
      );
    }
  }
};

// Process documents with concurrency control
const processDocsWithConcurrency = async (
  nodes: DocNode[],
  parentPath: string,
  identifyKey: string,
  language: string,
  includeMetadata: boolean,
  maxConcurrent: number,
  delay: number,
): Promise<void> => {
  const queue = [...nodes];
  const inProgress: Promise<void>[] = [];

  while (queue.length > 0 || inProgress.length > 0) {
    // Start new tasks up to the concurrent limit
    while (inProgress.length < maxConcurrent && queue.length > 0) {
      const node = queue.shift()!;
      const task = processDocNode(
        node,
        parentPath,
        identifyKey,
        language,
        includeMetadata,
        delay,
        0, // depth starts at 0 for top-level docs
        [], // breadcrumbs starts empty for top-level docs
      );
      inProgress.push(task);
    }

    // Wait for at least one task to complete
    if (inProgress.length > 0) {
      await Promise.race(inProgress);
      // Remove completed tasks
      for (let i = inProgress.length - 1; i >= 0; i--) {
        try {
          await Promise.race([inProgress[i], Promise.resolve()]);
          inProgress.splice(i, 1);
        } catch (error) {
          // Task is still running
        }
      }
    }
  }
};

// Generate a table of contents
const generateTableOfContents = (nodes: DocNode[], depth = 0): string => {
  let toc = "";

  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    const filename = sanitizeFilename(node.title);
    const link =
      node.child_docs && node.child_docs.length > 0
        ? `./${filename}/index.md`
        : `./${filename}.md`;

    toc += `${indent}- [${node.title}](${link})\n`;

    if (node.child_docs && node.child_docs.length > 0) {
      toc += generateTableOfContents(node.child_docs, depth + 1);
    }
  }

  return toc;
};

// Main download function
const downloadDocs = async (config: DownloadConfig = {}): Promise<void> => {
  const {
    identifyKey = "c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b",
    outputDir = "./tiktok-docs",
    language = "ENGLISH",
    includeMetadata = true,
    maxConcurrent = 15,
    delay = 500,
  } = config;

  try {
    console.log("🚀 Starting TikTok API Documentation Download\n");
    console.log("Configuration:");
    console.log(`  Output Directory: ${outputDir}`);
    console.log(`  Language: ${language}`);
    console.log(`  Include Metadata: ${includeMetadata}`);
    console.log(`  Max Concurrent: ${maxConcurrent}`);
    console.log(`  Delay between requests: ${delay}ms\n`);

    // Fetch the documentation tree
    console.log("📚 Fetching documentation tree...");
    const treeResponse = await fetchDocTree(identifyKey, language);
    const { primary_doc_list, doc_platform_name } = treeResponse.data;

    console.log(`✅ Found ${primary_doc_list.length} top-level documents\n`);
    console.log(`📖 Platform: ${doc_platform_name}\n`);

    // Create output directory
    await ensureDir(outputDir);

    // Process all documents
    console.log("📥 Downloading documentation...\n");
    for (const node of primary_doc_list) {
      await processDocNode(
        node,
        outputDir,
        identifyKey,
        language,
        includeMetadata,
        delay,
        0, // depth starts at 0 for top-level docs
        [], // breadcrumbs starts empty for top-level docs
      );
    }

    // Generate README with table of contents
    console.log("\n📝 Generating README with table of contents...");
    let readmeContent = `# ${doc_platform_name} Documentation\n\n`;
    readmeContent +=
      "This documentation was automatically downloaded from the TikTok Business API.\n\n";
    readmeContent += "## Table of Contents\n\n";
    readmeContent += generateTableOfContents(primary_doc_list);
    readmeContent += "\n---\n\n";
    readmeContent += `*Downloaded on: ${new Date().toISOString()}*\n`;
    readmeContent += `*Language: ${language}*\n`;

    await fs.writeFile(
      path.join(outputDir, "README.md"),
      readmeContent,
      "utf-8",
    );

    // Generate a manifest file
    const manifest = {
      platform: doc_platform_name,
      language,
      identifyKey,
      downloadedAt: new Date().toISOString(),
      totalDocs: countDocs(primary_doc_list),
      structure: primary_doc_list,
    };

    await fs.writeFile(
      path.join(outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    console.log("\n✅ Documentation download complete!");
    console.log(`📁 Files saved to: ${outputDir}`);
    console.log(`📊 Total documents: ${countDocs(primary_doc_list)}`);
  } catch (error) {
    console.error("\n❌ Error downloading documentation:", error);
    throw error;
  }
};

// Count total documents in tree
const countDocs = (nodes: DocNode[]): number => {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "MARKDOWN") {
      count++;
    }
    if (node.child_docs && node.child_docs.length > 0) {
      count += countDocs(node.child_docs);
    }
  }
  return count;
};

// Download specific document by ID
const downloadSpecificDoc = async (
  docId: number,
  outputPath: string,
  identifyKey?: string,
  language = "ENGLISH",
): Promise<void> => {
  const key =
    identifyKey ||
    "c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b";

  console.log(`📄 Downloading document ${docId}...`);
  const content = await fetchDocContent(docId, key, language);

  let fileContent = `# ${content.data.title}\n\n`;
  fileContent += content.data.content;

  await fs.writeFile(outputPath, fileContent, "utf-8");
  console.log(`✅ Saved to: ${outputPath}`);
};

// Main execution
const main = async (): Promise<void> => {
  // Check for command line arguments
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
TikTok API Documentation Downloader

Usage:
  npm start                     Download all documentation with default settings
  npm start -- --doc-id 123    Download specific document by ID
  npm start -- --help          Show this help message

Options:
  --output-dir <path>          Output directory (default: ./tiktok-docs)
  --language <lang>            Language (default: ENGLISH)
  --no-metadata               Don't include metadata in markdown files
  --max-concurrent <n>         Max concurrent downloads (default: 3)
  --delay <ms>                Delay between requests in ms (default: 500)
  --doc-id <id>               Download specific document by ID
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

  const docId = getArg("--doc-id");

  if (docId) {
    // Download specific document
    const outputPath = getArg("--output") || `doc_${docId}.md`;
    await downloadSpecificDoc(Number.parseInt(docId), outputPath);
  } else {
    // Download all documentation
    const config: DownloadConfig = {
      outputDir: getArg("--output-dir") || "./tiktok-docs",
      language: getArg("--language") || "ENGLISH",
      includeMetadata: !args.includes("--no-metadata"),
      maxConcurrent: Number.parseInt(getArg("--max-concurrent") || "3"),
      delay: Number.parseInt(getArg("--delay") || "500"),
    };

    await downloadDocs(config);
  }
};

export {
  downloadDocs,
  downloadSpecificDoc,
  countDocs,
  processDocsWithConcurrency,
  processDocNode,
  generateTableOfContents,
};

// Run if executed directly
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
