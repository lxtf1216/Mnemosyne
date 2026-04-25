#!/usr/bin/env node

import "dotenv/config";
import { getEsClient, checkConnection } from "./elasticsearch/client.js";
import { initPapersIndex, getPapersCount, searchPapers, transformArxivPaper } from "./elasticsearch/papers.js";
import { initInsightsIndex, getInsightsCount } from "./elasticsearch/insights.js";
import { processInbox } from "./parsers/paper-ingestor.js";
import { embeddingService } from "./embedding/service.js";

export interface StatusResult {
  esConnected: boolean;
  papersCount: number;
  insightsCount: number;
  embeddingDim: number | null;
  indexesInitialized: boolean;
}

export async function checkStatus(): Promise<StatusResult> {
  const client = getEsClient();
  const esConnected = await checkConnection(client);

  if (!esConnected) {
    return {
      esConnected: false,
      papersCount: 0,
      insightsCount: 0,
      embeddingDim: null,
      indexesInitialized: false,
    };
  }

  // Start embedding service to get dimension
  let embeddingDim: number | null = null;
  try {
    await embeddingService.start();
    embeddingDim = embeddingService.dimension;
  } catch (e) {
    console.warn("Failed to start embedding service:", e);
  }

  // Initialize indexes if needed
  let indexesInitialized = false;
  if (embeddingDim !== null) {
    try {
      await initPapersIndex(client, embeddingDim);
      await initInsightsIndex(client, embeddingDim);
      indexesInitialized = true;
    } catch (e) {
      console.error("Failed to initialize indexes:", e);
    }
  }

  const papersCount = await getPapersCount(client).catch(() => 0);
  const insightsCount = await getInsightsCount(client).catch(() => 0);

  return {
    esConnected,
    papersCount,
    insightsCount,
    embeddingDim,
    indexesInitialized,
  };
}

// CLI commands
type Command = "status" | "search" | "add-paper" | "from-inbox";

interface CLIArgs {
  command: Command;
  query?: string;
  topic?: string;
  type?: "papers" | "insights" | "all";
  venue?: string;
  year?: string;
  limit?: number;
  max?: number;
  yearFrom?: number;
  yearTo?: number;
  dryRun?: boolean;
}

function parseArgs(): CLIArgs | null {
  const args = process.argv.slice(2);
  if (args.length === 0) return null;

  const command = args[0] as Command;
  if (!["status", "search", "add-paper", "from-inbox"].includes(command)) {
    return null;
  }

  const result: CLIArgs = { command };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--topic") result.topic = args[++i];
    else if (arg === "--type") result.type = args[++i] as "papers" | "insights" | "all";
    else if (arg === "--venue") result.venue = args[++i];
    else if (arg === "--year") result.year = args[++i];
    else if (arg === "--limit") result.limit = parseInt(args[++i]);
    else if (arg === "--max") result.max = parseInt(args[++i]);
    else if (arg === "--year-from") result.yearFrom = parseInt(args[++i]);
    else if (arg === "--year-to") result.yearTo = parseInt(args[++i]);
    else if (arg === "--dry-run") result.dryRun = true;
    else if (!arg.startsWith("--")) result.query = arg;
  }

  return result;
}

async function runSearch(client: Awaited<ReturnType<typeof getEsClient>>, args: CLIArgs) {
  if (!args.query) {
    console.error("Query required for search");
    process.exit(1);
  }

  await embeddingService.start();

  const papers = await searchPapers(client, args.query, {
    venue: args.venue,
    year: args.year,
    limit: args.limit || 10,
  });

  if (papers.length === 0) {
    console.log("No papers found");
    return;
  }

  console.log(`Found ${papers.length} papers:\n`);
  papers.forEach((p, i) => {
    console.log(`${i + 1}. ${p.title}`);
    console.log(`   Authors: ${p.authors.join(", ") || "N/A"}`);
    console.log(`   Date: ${p.date}`);
    console.log(`   Venue: ${p.venue || "N/A"}`);
    console.log(`   Keywords: ${p.keywords?.join(", ") || "N/A"}`);
    console.log(`   Abstract: ${p.abstract.substring(0, 200)}...`);
    console.log("");
  });
}

async function runAddPaper(client: Awaited<ReturnType<typeof getEsClient>>, args: CLIArgs) {
  if (!args.topic) {
    console.error("--topic required for add-paper");
    process.exit(1);
  }

  await embeddingService.start();

  const { searchAndIndexArxiv } = await import("./elasticsearch/papers.js");

  const result = await searchAndIndexArxiv(client, args.topic, {
    maxResults: args.max || 20,
    yearFrom: args.yearFrom,
    yearTo: args.yearTo,
    dryRun: args.dryRun,
  });

  if (args.dryRun) {
    console.log(`[DRY RUN] Would index ${result.papers.length} papers:`);
    result.papers.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.title}`);
      console.log(`     Authors: ${p.authors.join(", ") || "N/A"}`);
      console.log(`     arXiv ID: ${p.arxiv_id}`);
    });
  } else {
    console.log(`Indexed ${result.success} papers, ${result.failed} failed`);
  }
}

async function runFromInbox(args: CLIArgs) {
  const inboxDir = process.env.MNEMOSYNE_INBOX_DIR || "./inbox";
  const processedDir = `${inboxDir}/processed`;

  console.log(`Processing inbox: ${inboxDir}`);

  if (args.dryRun) {
    const { readdirSync, existsSync } = await import("fs");
    if (!existsSync(inboxDir)) {
      console.log("[DRY RUN] Inbox directory does not exist");
      return;
    }
    const files = readdirSync(inboxDir).filter((f) => f.endsWith(".pdf"));
    console.log(`[DRY RUN] Would process ${files.length} files:`);
    files.forEach((f) => console.log(`  - ${f}`));
    return;
  }

  const result = await processInbox(inboxDir, processedDir);
  console.log(`Processed ${result.success} papers, ${result.failed} failed`);
  if (result.errors.length > 0) {
    console.log("Errors:");
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

// CLI entry point - run with: node dist/index.js <command> [options]
const isMain = process.argv[1]?.endsWith("index.js");
if (isMain) {
  const args = parseArgs();

  if (!args) {
    // Default to status
    checkStatus()
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      })
      .catch((e: Error) => {
        console.error(JSON.stringify({ error: e.message }));
        process.exit(1);
      });
    process.exit(0);
  }

  const client = getEsClient();

  try {
    switch (args.command) {
      case "status":
        console.log(JSON.stringify(await checkStatus(), null, 2));
        break;
      case "search":
        await runSearch(client, args);
        break;
      case "add-paper":
        await runAddPaper(client, args);
        break;
      case "from-inbox":
        await runFromInbox(args);
        break;
    }
  } catch (e: unknown) {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }
}
