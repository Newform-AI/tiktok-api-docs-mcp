#!/usr/bin/env node

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface FieldData {
  field: string;
  docType?: string;
  tsType?: string;
  description: string;
  isDefault?: boolean;
}

// Configuration
const CONFIG = {
  url: 'https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/',
  puppeteerOptions: {
    headless: 'new' as const,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
} as const;

// Pure functions for data transformation
const cleanText = (text: string): string => 
  text.replace(/\s+/g, ' ').trim();

type TypeMap = Record<string, string>;

const extractFieldFromRow = ($: cheerio.CheerioAPI, row: any, typeMap?: TypeMap): FieldData | null => {
  const $row = $(row);
  const $cells = $row.find('td');

  if ($cells.length < 2) return null;

  const $firstCell = $($cells[0]);
  const $secondCell = $($cells[1]);

  const fieldName = $firstCell.find('code').first().text().trim();
  const fieldTypeFromHtml = $firstCell.find('span').last().text().trim();
  // Prefer the first non-empty paragraph as description, fall back to other text if needed
  const paragraphTexts = $secondCell
    .find('p')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter((text) => text.length > 0);

  let description = paragraphTexts[0] || '';
  if (!description) {
    // Fall back to any non-empty text contained in divs
    const divText = cleanText(
      $secondCell
        .find('div')
        .toArray()
        .map((el) => $(el).text())
        .join(' ')
    );
    description = divText || cleanText($secondCell.text());
  }

  // Detect default presence by text, not FB-specific classes
  const isDefault = /Default value/i.test($secondCell.text());

  if (!fieldName || !description) return null;

  return {
    field: fieldName,
    docType: fieldTypeFromHtml || undefined,
    tsType: typeMap?.[fieldName] || undefined,
    description,
    isDefault
  };
};

const parseTableFromHtml = (html: string, typeMap?: TypeMap): FieldData[] => {
  const $ = cheerio.load(html);
  const fields: FieldData[] = [];

  // Select rows from the parameters tables; fall back to any table rows
  $('table._4-ss._5k9x tbody tr, table._4-ss._5k9x tr, table tbody tr, table tr').each((_, row) => {
    const field = extractFieldFromRow($, row, typeMap);
    if (field) {
      fields.push(field);
    }
  });

  return fields;
};

// Load and parse TypeScript interface file to build a field -> type map
const parseTypesFromTsInterface = (tsSource: string): TypeMap => {
  const typeMap: TypeMap = {};

  // Try to isolate the AdsInsights interface block if present
  const ifaceMatch = tsSource.match(/export\s+interface\s+AdsInsights\s*\{([\s\S]*?)\}/);
  const body = ifaceMatch ? ifaceMatch[1] : tsSource;

  // Match lines like: "field_name": Type; or field_name: Type;
  const propertyRegex = /\n\s*(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  for (;;) {
    match = propertyRegex.exec(body);
    if (!match) break;
    const name = (match[1] || match[2] || '').trim();
    const type = (match[3] || '').trim();
    if (name && type) {
      typeMap[name] = type;
    }
  }

  return typeMap;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const loadAdsInsightsTypes = async (): Promise<TypeMap | undefined> => {
  // Priority: CLI --types path, ENV INSIGHTS_TYPES_PATH, common fallback paths
  const args = process.argv.slice(2);
  const typesArg = args.find(a => a.startsWith('--types='));
  const fromCliPath = typesArg ? typesArg.split('=')[1] : undefined;
  const fromEnvPath = process.env.INSIGHTS_TYPES_PATH;

  const candidatePaths = [fromCliPath, fromEnvPath,
    path.join(process.cwd(), 'src', 'scripts', 'AdsInsights.ts'),
    path.join(process.cwd(), 'src', 'scripts', 'adsInsights.ts'),
    path.join(process.cwd(), 'src', 'scripts', 'ads-insights.ts'),
  ].filter(Boolean) as string[];

  for (const candidate of candidatePaths) {
    try {
      if (!(await fileExists(candidate))) continue;
      const source = await fs.readFile(candidate, 'utf8');
      const map = parseTypesFromTsInterface(source);
      if (Object.keys(map).length > 0) {
        console.log(`🔎 Loaded AdsInsights types from ${path.relative(process.cwd(), candidate)}`);
        return map;
      }
    } catch {
      // ignore and try next
    }
  }

  return undefined;
};

// Puppeteer browser automation
const createBrowser = async () => {
  console.log('🚀 Launching browser...');
  return await puppeteer.launch(CONFIG.puppeteerOptions as any);
};

const fetchDocumentationHtml = async (url: string): Promise<string> => {
  console.log('🌐 Fetching data from Facebook API documentation...');
  
  const browser = await createBrowser();
  
  try {
    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📄 Navigating to page...');
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the table to load
    console.log('⏳ Waiting for table content to load...');
    await page.waitForSelector('table', { timeout: 15000 });
    
    // Additional wait to ensure dynamic content is loaded
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Get the HTML content
    const html = await page.content();
    await fs.writeFile('facebook-api-fields.html', html, 'utf8');
    console.log('✅ Successfully fetched HTML content');
    
    return html;
  } catch (error: any) {
    console.error('❌ Error fetching data:', error.message);
    throw new Error(`Failed to fetch documentation: ${error.message}`);
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
};

// Format converters (same as before)
const convertToMarkdown = (fields: FieldData[]): string => {
  const header = '# Facebook Marketing API Insights Fields\n\n';
  const tableHeader = '| Field | Doc Type | TS Type | Description | Default |\n|-------|----------|---------|-------------|---------|\\n';
  
  const rows = fields
    .map(field => {
      const defaultMark = field.isDefault ? '✓' : '';
      const escapedDescription = field.description.replace(/\|/g, '\\|');
      return `| \`${field.field}\` | ${field.docType || ''} | ${field.tsType || ''} | ${escapedDescription} | ${defaultMark} |`;
    })
    .join('\n');

  return header + tableHeader + rows;
};

const convertToCSV = (fields: FieldData[]): string => {
  const header = 'Field,DocType,TsType,Description,Default';
  
  const rows = fields
    .map(field => {
      const escapedDescription = `"${field.description.replace(/"/g, '""')}"`;
      const defaultValue = field.isDefault ? 'true' : 'false';
      return `"${field.field}","${field.docType || ''}","${field.tsType || ''}",${escapedDescription},${defaultValue}`;
    });

  return [header, ...rows].join('\n');
};

const convertToJSON = (fields: FieldData[]): string => 
  JSON.stringify(fields, null, 2);

// File operations (same as before)
const generateTimestampedFilename = (format: string): string => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  return `facebook-api-fields-${timestamp}.${format}`;
};

const saveToFile = async (content: string, format: string): Promise<string> => {
  const filename = generateTimestampedFilename(format);
  const filepath = path.join(process.cwd(), filename);

  await fs.writeFile(filepath, content, 'utf8');
  console.log(`💾 File saved: ${filepath}`);
  return filepath;
};

// Content conversion logic (same as before)
const convertContent = (fields: FieldData[], format: string): { content: string; extension: string } => {
  switch (format.toLowerCase()) {
    case 'markdown':
    case 'md':
      return { content: convertToMarkdown(fields), extension: 'md' };
    case 'csv':
      return { content: convertToCSV(fields), extension: 'csv' };
    case 'json':
    default:
      return { content: convertToJSON(fields), extension: 'json' };
  }
};

// Validation (same as before)
const validateFormat = (format: string): boolean => 
  ['markdown', 'md', 'csv', 'json'].includes(format.toLowerCase());

// Preview functionality (same as before)
const previewContent = (content: string, maxLength: number = 500): void => {
  console.log('\n📋 Preview:');
  console.log('-'.repeat(50));
  const preview = content.slice(0, maxLength);
  const truncated = content.length > maxLength;
  console.log(preview + (truncated ? '...\n[truncated]' : ''));
  console.log('-'.repeat(50));
};

// Main processing pipeline
const processFacebookAPIDocumentation = async (format: string): Promise<void> => {
  // Validation
  if (!validateFormat(format)) {
    throw new Error(`Invalid format: ${format}. Supported formats: markdown, csv, json`);
  }

  // Fetch and parse
  const html = await fetchDocumentationHtml(CONFIG.url);
  const tsTypeMap = await loadAdsInsightsTypes();
  const fields = parseTableFromHtml(html, tsTypeMap);

  if (fields.length === 0) {
    throw new Error('No fields found. The page structure might have changed.');
  }

  console.log(`📊 Parsed ${fields.length} fields from the documentation`);

  // Convert and save
  const { content, extension } = convertContent(fields, format);
  const filepath = await saveToFile(content, extension);

  // Preview
  previewContent(content);

  console.log(`🎉 Successfully processed ${fields.length} fields and saved to ${path.basename(filepath)}`);
};

// CLI interface (same as before)
const parseCommandLineArgs = (): string => {
  const args = process.argv.slice(2);
  return args[0]?.toLowerCase() || 'json';
};

const showUsage = (): void => {
  console.log('Usage: npm run scrape [format]');
  console.log('Available formats: markdown (or md), csv, json');
  console.log('');
  console.log('Examples:');
  console.log('  npm run scrape json');
  console.log('  npm run scrape csv');
  console.log('  npm run scrape markdown');
  console.log('');
  console.log('Optional: Provide AdsInsights types to override field types:');
  console.log('  npm run scrape json --types=src/scripts/AdsInsights.ts');
  console.log('  INSIGHTS_TYPES_PATH=src/scripts/AdsInsights.ts npm run scrape json');
  console.log('');
  console.log('Note: This uses Puppeteer for reliable web scraping');
};

// Main execution
const main = async (): Promise<void> => {
  try {
    const format = parseCommandLineArgs();

    if (format === 'help' || format === '--help' || format === '-h') {
      showUsage();
      return;
    }

    console.log(`🚀 Starting Facebook API documentation scraper`);
    console.log(`📄 Output format: ${format.toUpperCase()}`);
    console.log(`🤖 Using Puppeteer for browser automation`);

    await processFacebookAPIDocumentation(format);

  } catch (error: any) {
    console.error('💥 Script failed:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 Tip: The page might be loading slowly. Try again or check your internet connection.');
    }
    
    process.exit(1);
  }
};

// Export for testing
export {
  parseTableFromHtml,
  convertToMarkdown,
  convertToCSV,
  convertToJSON,
  extractFieldFromRow,
  cleanText,
  validateFormat
};

// Run if executed directly (ES module compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}