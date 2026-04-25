/**
 * Paper Ingestor - Enriches papers with PDF content
 *
 * Flow:
 * 1. Download PDF from arXiv URL or local path
 * 2. Parse with MinerU (API or local)
 * 3. Extract structured fields from parsed content
 * 4. Return enriched paper fields
 */

import { parsePdf, MineruResult } from "./mineru.js";
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createWriteStream, unlinkSync, existsSync, mkdirSync, promises as fs, unlink } from "fs";
import { pipeline } from "stream/promises";
import { getEsClient, esRequest } from "../elasticsearch/client.js";
import { PAPERS_INDEX } from "../elasticsearch/papers.js";
import { embeddingService } from "../embedding/service.js";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PYTHON_PATH = process.env.PYTHON || "python3";

export interface EnrichedFields {
  method_description?: string;
  datasets?: string[];
  experiment_description?: string;
}

export interface PdfEnrichmentResult {
  success: boolean;
  fields?: EnrichedFields;
  error?: string;
}

/**
 * Download PDF from URL to local path
 */
async function downloadPdf(url: string, localPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status}`);
  }

  // Ensure directory exists
  const dir = localPath.substring(0, localPath.lastIndexOf("/"));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!response.body) {
    throw new Error("Response has no body");
  }

  await pipeline(response.body, createWriteStream(localPath));
}

/**
 * Extract structured fields from MinerU result using Claude sub-agent
 */
async function extractFieldsWithClaude(result: MineruResult): Promise<EnrichedFields> {
  const fields: EnrichedFields = {};

  if (!result.sections || result.sections.length === 0) {
    return fields;
  }

  // Build context for Claude
  const sectionsText = result.sections
    .map((s) => `## ${s.heading || "Unknown"}\n${s.content}`)
    .join("\n\n");

  const abstract = result.abstract || "";
  const title = result.title || "Unknown";

  const prompt = `You are a research paper analyzer. Given the following paper, extract structured information.

## Title
${title}

## Abstract
${abstract}

## Paper Sections
${sectionsText}

## Your Task
Generate a concise summary (2-3 sentences each) for these fields:

1. **method_description**: The main methodology and approach. Focus on the key techniques, model architecture, and innovation. Summarize in your own words, do NOT copy原文.

2. **experiment_description**: Describe the experimental methodology. Include: (1) datasets and their splits (train/dev/test sizes); (2) evaluation metrics used; (3) ablation study setup - what components are removed or modified to verify their contribution. Focus on methodology, NOT results. Keep to 2-3 sentences.

3. **datasets**: Extract dataset names mentioned. Return as JSON array of strings.

## Output Format
Return as JSON:
{
  "method_description": "...",
  "experiment_description": "...",
  "datasets": ["name1", "name2"]
}

Only output valid JSON, no markdown formatting.`;

  // Return the fields promise directly (no temp file needed)
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", [
      "-p",
      prompt,  // Pass prompt as command argument
    ], {
      env: { ...process.env },
      timeout: 60000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.warn(`Claude summarization failed: ${stderr}`);
        resolve(extractFieldsSimple(result));
        return;
      }

      try {
        // Parse JSON output from Claude
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          fields.method_description = parsed.method_description;
          fields.experiment_description = parsed.experiment_description;
          fields.datasets = parsed.datasets || [];
          resolve(fields);
        } else {
          resolve(extractFieldsSimple(result));
        }
      } catch (e) {
        console.warn(`Failed to parse Claude JSON: ${e}, using simple extraction`);
        resolve(extractFieldsSimple(result));
      }
    });
  });
}

/**
 * Simple rule-based extraction (fallback when Claude unavailable)
 */
function extractFieldsSimple(result: MineruResult): EnrichedFields {
  const fields: EnrichedFields = {};

  if (!result.sections || result.sections.length === 0) {
    return fields;
  }

  const sectionsText = result.sections
    .map((s) => `${s.heading || ""}: ${s.content}`)
    .join("\n\n");

  const methodSection = result.sections.find((s) => {
    const heading = (s.heading || "").toLowerCase();
    return (
      heading.includes("method") ||
      heading.includes("approach") ||
      heading.includes("model") ||
      heading.includes("architecture")
    );
  });
  if (methodSection) {
    fields.method_description = methodSection.content.substring(0, 2000);
  }

  const experimentSection = result.sections.find((s) => {
    const heading = (s.heading || "").toLowerCase();
    return (
      heading.includes("experiment") ||
      heading.includes("evaluation") ||
      heading.includes("result") ||
      heading.includes("benchmark")
    );
  });
  if (experimentSection) {
    fields.experiment_description = experimentSection.content.substring(0, 2000);
  }

  const knownDatasets = /Phoenix-2014T|CSL-Daily|How2Sign|BOBSL|PublayNet|S2ORC|ImageNet|COCO|GLUE|SQuAD|alpaca|flan/gi;
  const excludeWords = /^(with|that|this|from|which|have|from|also|have|their|these|into|than|using|such|using|after|before)$/i;
  const datasets = new Set<string>();

  for (const match of sectionsText.matchAll(knownDatasets) || []) {
    const name = match[0];
    if (!excludeWords.test(name)) {
      datasets.add(name);
    }
  }

  if (datasets.size > 0) {
    fields.datasets = Array.from(datasets).slice(0, 10);
  }

  return fields;
}

/**
 * Enrich a paper by downloading and parsing its PDF
 */
export async function enrichPaperWithPdf(
  pdfUrl: string,
  localCacheDir: string = "./.pdf_cache"
): Promise<PdfEnrichmentResult> {
  let localPdfPath: string | null = null;

  try {
    // Download PDF
    const pdfFileName = pdfUrl.split("/").pop() || `${randomUUID()}.pdf`;
    localPdfPath = resolve(localCacheDir, pdfFileName);

    console.log(`Downloading PDF from ${pdfUrl}...`);
    await downloadPdf(pdfUrl, localPdfPath);
    console.log(`PDF downloaded to ${localPdfPath}`);

    // Parse with MinerU
    console.log("Parsing PDF with MinerU...");
    const result = await parsePdf(localPdfPath);

    if (result.error) {
      return { success: false, error: result.error };
    }

    // Extract fields using Claude sub-agent
    const fields = await extractFieldsWithClaude(result);

    console.log("Extracted fields:", Object.keys(fields).join(", "));

    return { success: true, fields };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  } finally {
    // Cleanup downloaded PDF
    if (localPdfPath && existsSync(localPdfPath)) {
      try {
        unlinkSync(localPdfPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Process papers from inbox directory
 */
export async function processInbox(
  inboxDir: string = "./inbox",
  processedDir: string = "./inbox/processed"
): Promise<{ success: number; failed: number; errors: string[] }> {
  const { readdirSync, existsSync, mkdirSync, renameSync } = await import("fs");

  if (!existsSync(inboxDir)) {
    return { success: 0, failed: 0, errors: ["Inbox directory does not exist"] };
  }

  if (!existsSync(processedDir)) {
    mkdirSync(processedDir, { recursive: true });
  }

  const files = readdirSync(inboxDir).filter((f) => f.endsWith(".pdf"));
  if (files.length === 0) {
    return { success: 0, failed: 0, errors: [] };
  }

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const file of files) {
    const pdfPath = resolve(inboxDir, file);
    const baseName = file.replace(".pdf", "");

    try {
      console.log(`Processing ${file}...`);

      // Parse PDF
      const result = await parsePdf(pdfPath);
      if (result.error) {
        throw new Error(result.error);
      }

      // Extract fields using Claude sub-agent
      const fields = await extractFieldsWithClaude(result);

      // Generate embedding for the abstract
      let embedding: number[] = [];
      if (result.abstract) {
        if (!embeddingService.isStarted) {
          await embeddingService.start();
        }
        embedding = await embeddingService.embed(result.abstract.substring(0, 5000));
      }

      // Create paper document
      const paper = {
        paper_id: randomUUID(),
        title: result.title || baseName,
        authors: result.authors || [],
        date: new Date().toISOString().split("T")[0],
        venue: undefined,
        keywords: undefined,
        abstract: result.abstract || "",
        method_description: fields.method_description,
        datasets: fields.datasets,
        experiment_description: fields.experiment_description,
        references: undefined,
        cited_by: undefined,
        source: "manual" as const,
        arxiv_id: result.arxiv_id || null,
        doi: null,
        pdf_path: pdfPath,
        embedding: embedding,
        embedding_status: embedding.length > 0 ? "done" : "failed",
        added_at: new Date().toISOString(),
        deleted: false,
      };

      // Check if paper already exists (dedup by arxiv_id or doi)
      const client = getEsClient();
      if (paper.arxiv_id) {
        const existing = await esRequest<{ hits: { total: { value: number } } }>(client, "GET", `/${PAPERS_INDEX}/_search`, {
          query: {
            bool: {
              must: [
                { term: { arxiv_id: paper.arxiv_id } },
                { term: { deleted: false } },
              ],
            },
          },
        });
        if (existing.hits.total.value > 0) {
          console.log(`Paper with arxiv_id ${paper.arxiv_id} already exists, skipping`);
          renameSync(pdfPath, resolve(processedDir, file));
          continue;
        }
      }

      // Index to ES
      await esRequest(client, "PUT", `/${PAPERS_INDEX}/_doc/${paper.paper_id}`, paper);

      // Move to processed
      renameSync(pdfPath, resolve(processedDir, file));
      success++;
      console.log(`Successfully processed ${file}`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${file}: ${message}`);
      console.error(`Failed to process ${file}: ${message}`);
    }
  }

  return { success, failed, errors };
}
