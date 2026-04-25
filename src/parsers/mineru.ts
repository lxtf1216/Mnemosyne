import { spawn, ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { pipeline } from "stream/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PYTHON_PATH = process.env.PYTHON || "python3";

export interface MineruResult {
  title?: string;
  authors?: string[];
  abstract?: string;
  sections?: { heading?: string; content: string }[];
  references?: { title: string; authors?: string[]; venue?: string }[];
  arxiv_id?: string;
  error?: string;
}

interface JsonElement {
  bbox?: number[];
  page_idx?: number;
  text?: string;
  text_level?: number;
  type?: string;
}

/**
 * Parse PDF using MinerU API via CLI tool
 */
async function callMineruApi(token: string, pdfPath: string): Promise<MineruResult> {
  const tmpDir = `/tmp/mineru_parse_${Date.now()}`;
  await fs.mkdir(tmpDir, { recursive: true });

  return new Promise((resolvePromise, reject) => {
    const proc = spawn("mineru-open-api", [
      "extract",
      pdfPath,
      "--format", "md,json",
      "-o", tmpDir,
      "--token", token,
    ], {
      env: { ...process.env, MINERU_TOKEN: token },
      timeout: 120000,
    });

    let stderr = "";
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`MinerU API failed: ${stderr}`));
        return;
      }

      // Read the output JSON file
      const baseName = pdfPath.split("/").pop() || "output";
      const jsonPath = `${tmpDir}/${baseName.replace(".pdf", ".json")}`;

      fs.readFile(jsonPath, "utf-8").then((content) => {
        try {
          const elements: JsonElement[] = JSON.parse(content);
          const result = parseMineruJson(elements);
          resolvePromise(result);
        } catch (e) {
          reject(new Error(`Failed to parse MinerU JSON output: ${e}`));
        }
      }).catch((e) => {
        reject(new Error(`Failed to read MinerU output: ${e}`));
      });
    });
  });
}

/**
 * Parse the JSON elements from MinerU into structured format
 */
function parseMineruJson(elements: JsonElement[]): MineruResult {
  const result: MineruResult = {
    sections: [],
    references: [],
  };

  // Group elements by type/text_level
  let currentSection: { heading?: string; content: string } | null = null;
  let inAbstract = false;
  let abstractText = "";

  // Regular expressions for section detection
  const sectionPattern = /^\d+\.\s+[A-Z]/;
  const refPattern = /^\[\d+\]/;

  for (const el of elements) {
    const text = el.text?.trim() || "";
    if (!text) continue;

    // Title detection (first text_level=1 item that's not a section)
    if (el.text_level === 1 && !result.title && !sectionPattern.test(text)) {
      result.title = text.replace(/^#\s*/, "").replace(/\s+$/, "");
      continue;
    }

    // Author detection - look for names with superscript numbers before Abstract
    if (!result.authors && el.type === "text") {
      // Skip email lines
      if (text.includes("@") && text.includes(".")) continue;
      // Skip affiliations that follow author pattern (like "1Singapore University...")
      if (/^\d+[A-Z]/.test(text)) continue;

      // Pattern: "Jia Gong1 Lin Geng Foo1 Yixuan He1 Hossein Rahmani2 Jun Liu1‡"
      // Names like "FirstName LastName" with optional superscripts like 1, †, ‡, *
      // Split by whitespace and filter for name-like patterns
      const parts = text.split(/\s+/);
      const potentialAuthors = parts
        .map(p => p.replace(/[0-9†‡*]+$/, ""))  // Strip trailing superscripts
        .filter(p => /^[A-Z][a-z]+$/.test(p));  // Keep only valid name parts

      if (potentialAuthors.length >= 2 && text.length < 200 && !text.includes("Abstract") && !text.includes("Introduction") && !sectionPattern.test(text)) {
        result.authors = potentialAuthors;
        continue;
      }
    }

    // ArXiv ID detection (appears in aside_text like "arXiv:2404.00925v1 [cs.CV]")
    if (!result.arxiv_id && el.type === "aside_text") {
      const arxivMatch = text.match(/arXiv:(\d+\.\d+[vV]\d*)/);
      if (arxivMatch) {
        result.arxiv_id = arxivMatch[1];
      }
    }

    // Abstract detection
    if (text.toLowerCase().includes("abstract") && !inAbstract) {
      // Check if this line is just "Abstract" heading
      if (text.replace(/\s+/g, " ").trim() === "Abstract") {
        inAbstract = true;
        abstractText = "";
        continue;
      }
    }

    if (inAbstract) {
      if (sectionPattern.test(text) || (el.text_level === 1 && text.match(/^[A-Z]/))) {
        // New section started, end abstract
        inAbstract = false;
        result.abstract = abstractText.trim();
        // Start new section
        const heading = text.replace(/^#+\s*/, "").trim();
        currentSection = { heading, content: "" };
        result.sections!.push(currentSection);
      } else {
        abstractText += " " + text;
      }
      continue;
    }

    // Section heading detection (text_level=1 and looks like "1. Introduction")
    if (el.text_level === 1 && sectionPattern.test(text)) {
      const heading = text.replace(/^#+\s*/, "").trim();
      currentSection = { heading, content: "" };
      result.sections!.push(currentSection);
      continue;
    }

    // Content accumulation
    if (currentSection) {
      currentSection.content += " " + text;
    }
  }

  // Check if abstract was at the end
  if (inAbstract && abstractText) {
    result.abstract = abstractText.trim();
  }

  // Clean up sections - remove empty and merge short content
  if (result.sections) {
    result.sections = result.sections
      .map(s => ({ heading: s.heading, content: s.content.trim() }))
      .filter(s => s.content.length > 50);
  }

  return result;
}

function callMineruLocal(pdfPath: string): Promise<MineruResult> {
  return new Promise((resolvePromise, reject) => {
    const scriptPath = resolve(__dirname, "mineru_local.py");
    const proc: ChildProcess = spawn(PYTHON_PATH, [scriptPath, pdfPath]);

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`MinerU local parse failed: ${stderr}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse MinerU output: ${stdout}`));
      }
    });
  });
}

export async function parsePdf(pdfPath: string): Promise<MineruResult> {
  const token = process.env.MINERU_API_TOKEN;

  if (token) {
    try {
      return await callMineruApi(token, pdfPath);
    } catch (e) {
      console.warn("MinerU API failed, falling back to local:", e);
    }
  }

  return callMineruLocal(pdfPath);
}