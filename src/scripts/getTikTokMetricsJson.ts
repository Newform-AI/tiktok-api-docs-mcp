
// Types
interface Metric {
  name: string;
  category: string;
  subcategory: string;
  type: string;
  description: string;
  commentary: string;
  deprecationStatus: "active" | "deprecated" | "to_be_deprecated";
}

interface ApiResponse {
  code: number;
  msg: string;
  data: {
    title: string;
    content: string;
  };
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

// Option types for frontend compatibility
interface Option {
  label: string;
  value: string;
}

interface OptionGroup {
  label: string;
  options: Option[];
}

// Functional utilities
const pipe =
  <T>(...fns: Array<(arg: T) => T>) =>
  (value: T): T =>
    fns.reduce((acc, fn) => fn(acc), value);

const map =
  <T, R>(fn: (item: T) => R) =>
  (array: T[]): R[] =>
    array.map(fn);

const filter =
  <T>(predicate: (item: T) => boolean) =>
  (array: T[]): T[] =>
    array.filter(predicate);

const trim = (str: string): string => str.trim();

const removeExtraWhitespace = (str: string): string =>
  str.replace(/\s+/g, " ").trim();

// Parse deprecation status from field name
const parseDeprecationStatus = (
  fieldName: string,
): {
  cleanName: string;
  status: "active" | "deprecated" | "to_be_deprecated";
} => {
  // Check for inline deprecation markers
  const toBeDeprecatedPattern = /\{-To be deprecated\}/i;
  const deprecatedPattern = /\{-deprecated\}/i;

  if (toBeDeprecatedPattern.test(fieldName)) {
    return {
      cleanName: fieldName.replace(toBeDeprecatedPattern, "").trim(),
      status: "to_be_deprecated",
    };
  }

  if (deprecatedPattern.test(fieldName)) {
    return {
      cleanName: fieldName.replace(deprecatedPattern, "").trim(),
      status: "deprecated",
    };
  }

  return {
    cleanName: fieldName,
    status: "active",
  };
};

// Parse xtable format
const parseXTable = (tableContent: string): ParsedTable => {
  const lines = tableContent.split("\n").filter((line) => line.trim());

  // First line contains headers with column widths
  const headerLine = lines[0];
  const headers = headerLine
    .split("|")
    .filter((h) => h.trim())
    .map((h) => h.replace(/\{[\d%]+\}/g, "").trim());

  // Skip the separator line (usually line 1)
  const dataLines = lines.slice(2);

  const rows = dataLines.map((line) =>
    line
      .replace(/^#/, "")
      .split("|")
      .filter((cell) => cell !== "")
      .map((cell) => cell.trim()),
  );

  return { headers, rows };
};

// Extract metric from table row
const extractMetricFromRow = (
  row: string[],
  headers: string[],
  category: string,
  subcategory: string,
): Metric | null => {
  // Find indices for required fields
  const fieldIndex = headers.findIndex(
    (h) => h.toLowerCase().includes("field") || h.toLowerCase() === "field",
  );
  const typeIndex = headers.findIndex(
    (h) => h.toLowerCase().includes("type") || h.toLowerCase() === "type",
  );
  const descIndex = headers.findIndex(
    (h) =>
      h.toLowerCase().includes("description") ||
      h.toLowerCase() === "description",
  );
  const detailIndex = headers.findIndex(
    (h) => h.toLowerCase().includes("detail") || h.toLowerCase() === "details",
  );

  if (fieldIndex === -1 || row.length <= fieldIndex) {
    console.log("Skipping row because of fieldIndex:", row);
    return null;
  }

  const fieldName = row[fieldIndex] || "";

  // Skip rows that are subcategory headers (usually single cell rows or rows starting with #)
  if (fieldName.startsWith("#") || fieldName === "" || row.length < 3) {
    console.log("Skipping row because of fieldName:", row);
    return null;
  }

  const { cleanName, status } = parseDeprecationStatus(fieldName);

  return {
    name: cleanName,
    category,
    subcategory,
    type: typeIndex !== -1 && row[typeIndex] ? row[typeIndex] : "string",
    description: descIndex !== -1 && row[descIndex] ? row[descIndex] : "",
    commentary: detailIndex !== -1 && row[detailIndex] ? row[detailIndex] : "",
    deprecationStatus: status,
  };
};

// Process markdown content
const processMarkdownContent = (content: string): Metric[] => {
  const metrics: Metric[] = [];
  let currentCategory = "General";
  let currentSubcategory = "General";
  let currentSubSubcategory = "";
  let currentInlineHeader = "";

  // Split content into lines for processing
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for category (h1)
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      currentCategory = line.substring(2).trim();
      currentSubcategory = "General";
      currentSubSubcategory = "";
      currentInlineHeader = "";
      console.log(currentCategory);
    }
    // Check for subcategory (h2)
    else if (line.startsWith("## ") && !line.startsWith("### ")) {
      currentSubcategory = line.substring(3).trim();
      currentSubSubcategory = "";
      currentInlineHeader = "";
      console.log(currentCategory, currentSubcategory);
    }
    // Check for sub-subcategory (h3)
    else if (line.startsWith("### ")) {
      currentSubSubcategory = line.substring(4).trim();
      currentInlineHeader = "";
      console.log(currentCategory, currentSubcategory, currentSubSubcategory);
    }
    // Check for xtable start
    else if (line.includes("```xtable")) {
      let addedMetrics = 0;
      // Find the end of the table
      let tableContent = "";
      i++;
      while (i < lines.length && !lines[i].includes("```")) {
        tableContent += `${lines[i]}\n`;
        i++;
      }

      // Parse the table
      if (tableContent.trim()) {
        const { headers, rows } = parseXTable(tableContent);

        // Process each row
        // biome-ignore lint/complexity/noForEach: <explanation>
        rows.forEach((row) => {
          // Check if this row is an inline header first
          const fieldIndex = headers.findIndex(
            (h) =>
              h.toLowerCase().includes("field") || h.toLowerCase() === "field",
          );
          const typeIndex = headers.findIndex(
            (h) =>
              h.toLowerCase().includes("type") || h.toLowerCase() === "type",
          );
          const descIndex = headers.findIndex(
            (h) =>
              h.toLowerCase().includes("description") ||
              h.toLowerCase() === "description",
          );

          if (fieldIndex !== -1 && row[fieldIndex]) {
            const fieldName = row[fieldIndex].trim();
            const typeValue =
              typeIndex !== -1 && row[typeIndex] ? row[typeIndex].trim() : "";
            const descValue =
              descIndex !== -1 && row[descIndex] ? row[descIndex].trim() : "";

            // Check if this is an inline header
            // Inline headers have field name but no type (may or may not have description)
            if (fieldName && !typeValue && !fieldName.startsWith("#")) {
              currentInlineHeader = fieldName;
              console.log("Found inline header:", currentInlineHeader);
              return; // Skip processing this row as a metric
            }
          }

          // Combine subcategory with sub-subcategory and inline header if they exist
          let effectiveSubcategory = currentSubcategory;
          if (currentSubSubcategory) {
            effectiveSubcategory = `${currentSubcategory} - ${currentSubSubcategory}`;
          }
          if (currentInlineHeader) {
            effectiveSubcategory =
              effectiveSubcategory === "General"
                ? currentInlineHeader
                : `${effectiveSubcategory} - ${currentInlineHeader}`;
          }

          const metric = extractMetricFromRow(
            row,
            headers,
            currentCategory,
            effectiveSubcategory,
          );
          if (metric) {
            metrics.push(metric);
            addedMetrics++;
          }
        });
        console.log(`Added ${addedMetrics} metrics (of ${rows.length})`);
      }
    }

    i++;
  }

  return metrics;
};

// Fetch data from API
const fetchApiData = async (
  identifyKey: string,
  docId: string,
): Promise<ApiResponse> => {
  const url =
    "https://business-api.tiktok.com/gateway/api/doc/client/node/get/";
  const params = {
    language: "ENGLISH",
    identify_key: identifyKey,
    doc_id: docId,
    is_need_content: "true", // We need content
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

// Main scraping function
const scrapeMetrics = async (identifyKey?: string): Promise<Metric[]> => {
  const key =
    identifyKey ||
    "c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b";
  const docId = "1751443967255553";
  try {
    console.log("Fetching metrics from TikTok API...");

    // Fetch data from API
    const apiResponse = await fetchApiData(key, docId);
    console.log(apiResponse);

    console.log(`Processing "${apiResponse.data.title}"...`);

    // Process markdown content
    const metrics = processMarkdownContent(apiResponse.data.content);

    console.log(`Successfully extracted ${metrics.length} metrics`);

    return metrics;
  } catch (error) {
    console.error("Error scraping metrics:", error);
    throw error;
  }
};

// Group metrics by category and subcategory
const groupMetrics = (
  metrics: Metric[],
): Record<string, Record<string, Metric[]>> => {
  return metrics.reduce(
    (acc, metric) => {
      if (!acc[metric.category]) {
        acc[metric.category] = {};
      }
      if (!acc[metric.category][metric.subcategory]) {
        acc[metric.category][metric.subcategory] = [];
      }
      acc[metric.category][metric.subcategory].push(metric);
      return acc;
    },
    {} as Record<string, Record<string, Metric[]>>,
  );
};

// Format output as JSON
const formatOutput = (metrics: Metric[]): string => {
  const grouped = groupMetrics(metrics);
  const deprecatedCount = metrics.filter(
    (m) => m.deprecationStatus !== "active",
  ).length;

  // Generate statistics
  const stats = {
    totalMetrics: metrics.length,
    activeMetrics: metrics.length - deprecatedCount,
    deprecatedMetrics: deprecatedCount,
    categoriesCount: Object.keys(grouped).length,
    byCategory: Object.entries(grouped).map(([category, subcategories]) => ({
      category,
      count: Object.values(subcategories).reduce(
        (sum, metrics) => sum + metrics.length,
        0,
      ),
      subcategories: Object.keys(subcategories).length,
    })),
  };

  return JSON.stringify(
    {
      metadata: {
        source: "TikTok Business API Documentation",
        extractedAt: new Date().toISOString(),
        version: "v1.3",
      },
      statistics: stats,
      categorized: grouped,
      metrics: metrics,
    },
    null,
    2,
  );
};

// Export specific categories
const exportByCategory = (metrics: Metric[], category: string): Metric[] => {
  return metrics.filter((m) =>
    m.category.toLowerCase().includes(category.toLowerCase()),
  );
};

// Export non-deprecated metrics only
const exportActiveMetrics = (metrics: Metric[]): Metric[] => {
  return metrics.filter((m) => m.deprecationStatus === "active");
};

// Format metrics as OptionGroups for frontend compatibility
const formatAsOptionGroups = (metrics: Metric[]): OptionGroup[] => {
  const grouped = groupMetrics(metrics);

  return Object.entries(grouped).flatMap(([category, subcategories]) =>
    Object.entries(subcategories).map(([subcategory, subMetrics]) => ({
      label:
        subcategory === "General" ? category : `${category} - ${subcategory}`,
      options: subMetrics.map((metric) => ({
        label: metric.description
          ? `${metric.name} - ${metric.description}`
          : metric.name,
        value: metric.name,
      })),
    })),
  );
};

// Format active metrics as OptionGroups (excluding deprecated)
const formatActiveAsOptionGroups = (metrics: Metric[]): OptionGroup[] => {
  const activeMetrics = exportActiveMetrics(metrics);
  return formatAsOptionGroups(activeMetrics);
};

// Main execution
const main = async (): Promise<void> => {
  try {
    console.log("Starting TikTok metrics extraction...");
    console.log("Using direct API endpoint for cleaner data\n");

    const metrics = await scrapeMetrics();

    // Generate statistics
    const deprecatedMetrics = metrics.filter(
      (m) => m.deprecationStatus !== "active",
    );
    const grouped = groupMetrics(metrics);

    console.log("\n=== Extraction Summary ===");
    console.log(`Total metrics extracted: ${metrics.length}`);
    console.log(`Active metrics: ${metrics.length - deprecatedMetrics.length}`);
    console.log(`Deprecated/To be deprecated: ${deprecatedMetrics.length}`);
    console.log(`Categories found: ${Object.keys(grouped).length}`);

    // Show breakdown by category
    console.log("\n=== Metrics by Category ===");
    // biome-ignore lint/complexity/noForEach: <explanation>
    Object.entries(grouped).forEach(([category, subcategories]) => {
      const count = Object.values(subcategories).reduce(
        (sum, metrics) => sum + metrics.length,
        0,
      );
      console.log(`${category}: ${count} metrics`);
    });

    // Save full output
    const output = formatOutput(metrics);
    const fs = await import("node:fs/promises");

    await fs.writeFile("tiktok_metrics.json", output, "utf-8");
    console.log("\n✓ Full results saved to tiktok_metrics.json");

    // Save active metrics only
    const activeMetrics = exportActiveMetrics(metrics);
    await fs.writeFile(
      "tiktok_metrics_active.json",
      JSON.stringify(activeMetrics, null, 2),
      "utf-8",
    );
    console.log(
      `✓ Active metrics (${activeMetrics.length}) saved to tiktok_metrics_active.json`,
    );

    // Save by major categories
    const categories = ["Regular metrics", "SKAN metrics", "SAN metrics"];
    for (const cat of categories) {
      const categoryMetrics = exportByCategory(metrics, cat);
      if (categoryMetrics.length > 0) {
        const filename = `tiktok_metrics_${cat.toLowerCase().replace(/\s+/g, "_")}.json`;
        await fs.writeFile(
          filename,
          JSON.stringify(categoryMetrics, null, 2),
          "utf-8",
        );
        console.log(
          `✓ ${cat} (${categoryMetrics.length} metrics) saved to ${filename}`,
        );
      }
    }

    // Save as OptionGroups for frontend compatibility
    const optionGroups = formatAsOptionGroups(metrics);
    await fs.writeFile(
      "tiktok_metrics_option_groups.json",
      JSON.stringify(optionGroups, null, 2),
      "utf-8",
    );
    console.log(
      `✓ OptionGroups format (${optionGroups.length} groups) saved to tiktok_metrics_option_groups.json`,
    );

    // Save active metrics as OptionGroups
    const activeOptionGroups = formatActiveAsOptionGroups(metrics);
    await fs.writeFile(
      "tiktok_metrics_active_option_groups.json",
      JSON.stringify(activeOptionGroups, null, 2),
      "utf-8",
    );
    console.log(
      `✓ Active OptionGroups format (${activeOptionGroups.length} groups) saved to tiktok_metrics_active_option_groups.json`,
    );

    // Show sample metric
    console.log("\n=== Sample Metric ===");
    console.log(JSON.stringify(metrics[0], null, 2));
  } catch (error) {
    console.error("Failed to extract metrics:", error);
    process.exit(1);
  }
};

// Export functions for use as a module

// Run if executed directly
main();
