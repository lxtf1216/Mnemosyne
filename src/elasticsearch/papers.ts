import { z } from "zod";
import { esRequest, getEsClient, paperIdSchema, paperSourceSchema, embeddingStatusSchema, EsClient } from "./client.js";

// Paper schema
export const paperSchema = z.object({
  paper_id: paperIdSchema,
  title: z.string().min(1),
  authors: z.array(z.string()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  abstract: z.string(),
  method_description: z.string().optional(),
  datasets: z.array(z.string()).optional(),
  experiment_description: z.string().optional(),
  references: z.array(z.string()).optional(),
  cited_by: z.array(z.string()).optional(),
  source: paperSourceSchema,
  arxiv_id: z.string().nullable(),
  doi: z.string().nullable(),
  pdf_path: z.string().nullable(),
  embedding: z.array(z.number()).optional(),
  embedding_status: embeddingStatusSchema,
  added_at: z.string().datetime(),
  deleted: z.boolean().default(false),
});

export type Paper = z.infer<typeof paperSchema>;

export const PAPERS_INDEX = "papers";

// Initialize papers index with dynamic embedding dimension
export async function initPapersIndex(client: EsClient, embeddingDim: number): Promise<void> {
  try {
    await esRequest<unknown>(client, "GET", `/${PAPERS_INDEX}`);
    // Index already exists
    return;
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("404")) {
      // Create index
      await esRequest(client, "PUT", `/${PAPERS_INDEX}`, {
        mappings: {
          properties: {
            paper_id: { type: "keyword" },
            title: { type: "text", analyzer: "english" },
            authors: { type: "keyword" },
            date: { type: "date" },
            venue: { type: "keyword" },
            keywords: { type: "keyword" },
            abstract: { type: "text", analyzer: "english" },
            method_description: { type: "text" },
            datasets: { type: "keyword" },
            experiment_description: { type: "text" },
            references: { type: "keyword" },
            cited_by: { type: "keyword" },
            source: { type: "keyword" },
            arxiv_id: { type: "keyword" },
            doi: { type: "keyword" },
            pdf_path: { type: "keyword" },
            embedding: { type: "dense_vector", dims: embeddingDim, index: true, similarity: "cosine" },
            embedding_status: { type: "keyword" },
            added_at: { type: "date" },
            deleted: { type: "boolean" },
          },
        },
      });
      return;
    }
    throw e;
  }
}

export async function indexPaper(client: EsClient, paper: Paper): Promise<void> {
  // Check if exists by arxiv_id or doi
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
      return;
    }
  } else if (paper.doi) {
    const existing = await esRequest<{ hits: { total: { value: number } } }>(client, "GET", `/${PAPERS_INDEX}/_search`, {
      query: {
        bool: {
          must: [
            { term: { doi: paper.doi } },
            { term: { deleted: false } },
          ],
        },
      },
    });
    if (existing.hits.total.value > 0) {
      console.log(`Paper with doi ${paper.doi} already exists, skipping`);
      return;
    }
  }

  await esRequest(client, "PUT", `/${PAPERS_INDEX}/_doc/${paper.paper_id}`, paper);
}

export async function bulkIndexPapers(client: EsClient, papers: Paper[]): Promise<{ success: number; failed: number }> {
  if (papers.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  // Batch in groups of 100
  for (let i = 0; i < papers.length; i += 100) {
    const batch = papers.slice(i, i + 100);

    // Build NDJSON body (each line is a JSON object, must end with newline)
    const lines: string[] = [];
    for (const doc of batch) {
      lines.push(JSON.stringify({ index: { _index: PAPERS_INDEX, _id: doc.paper_id } }));
      lines.push(JSON.stringify(doc));
    }
    // Final newline required by ES bulk API
    const body = lines.join("\n") + "\n";

    const res = await esRequest<{ errors: boolean; items: any[] }>(client, "POST", "/_bulk", body);

    for (const item of res.items) {
      if (item.index?.error) {
        failed++;
      } else {
        success++;
      }
    }
  }

  return { success, failed };
}

export async function getPapersCount(client: EsClient): Promise<number> {
  const res = await esRequest<{ count: number }>(client, "GET", `/${PAPERS_INDEX}/_count`);
  return res.count;
}

export async function searchPapers(
  client: EsClient,
  query: string,
  options?: {
    venue?: string;
    year?: string;
    limit?: number;
  }
): Promise<Paper[]> {
  const limit = options?.limit || 10;

  const searchBody: any = {
    size: limit,
    query: {
      bool: {
        must: [
          {
            bool: {
              should: [
                { multi_match: { query, fields: ["title^2", "abstract", "method_description"], type: "best_fields" } },
              ],
            },
          },
        ],
        filter: [{ term: { deleted: false } }],
      },
    },
  };

  if (options?.venue) {
    searchBody.query.bool.filter.push({ term: { venue: options.venue } });
  }
  if (options?.year) {
    searchBody.query.bool.filter.push({ range: { date: { gte: `${options.year}-01-01`, lte: `${options.year}-12-31` } } });
  }

  const res = await esRequest<{ hits: { hits: { _source: Paper }[] } }>(client, "POST", `/${PAPERS_INDEX}/_search`, searchBody);
  return res.hits.hits.map((h) => h._source);
}

export async function knnSearchPapers(
  client: EsClient,
  queryVector: number[],
  limit?: number
): Promise<Paper[]> {
  const res = await esRequest<{ hits: { hits: { _source: Paper }[] } }>(client, "POST", `/${PAPERS_INDEX}/_search`, {
    size: limit || 10,
    query: { term: { deleted: false } },
    knn: {
      field: "embedding",
      query_vector: queryVector,
      k: limit || 10,
      num_candidates: 100,
    },
  });
  return res.hits.hits.map((h) => h._source);
}

export async function hybridSearchPapers(
  client: EsClient,
  query: string,
  queryVector: number[],
  options?: { venue?: string; year?: string; limit?: number }
): Promise<Paper[]> {
  const limit = options?.limit || 10;

  const res = await esRequest<{ hits: { hits: { _source: Paper; score: number }[] } }>(client, "POST", `/${PAPERS_INDEX}/_search`, {
    size: limit,
    query: {
      bool: {
        must: [
          {
            bool: {
              should: [
                { multi_match: { query, fields: ["title^2", "abstract", "method_description"], type: "best_fields" } },
              ],
            },
          },
        ],
        filter: [{ term: { deleted: false } }],
      },
    },
    knn: {
      field: "embedding",
      query_vector: queryVector,
      k: limit,
      num_candidates: 100,
    },
rank: {
      rrf: {
        rank_constant: 60,
      },
    },
  });

  return res.hits.hits.map((h) => h._source);
}

// Transform arXiv paper to Paper format for indexing
import type { ArxivPaper } from "../crawlers/arxiv.js";
import { randomUUID } from "crypto";
import { embeddingService } from "../embedding/service.js";

export async function transformArxivPaper(
  arxivPaper: ArxivPaper,
  embedding: number[],
  enrichment?: {
    venue?: string;
    references?: string[];
    citedBy?: string[];
  }
): Promise<Paper> {
  return {
    paper_id: randomUUID(),
    title: arxivPaper.title,
    authors: arxivPaper.authors,
    date: arxivPaper.published,
    venue: enrichment?.venue,
    keywords: arxivPaper.categories.length > 0 ? arxivPaper.categories : undefined,
    abstract: arxivPaper.abstract,
    method_description: undefined,
    datasets: undefined,
    experiment_description: undefined,
    references: enrichment?.references,
    cited_by: enrichment?.citedBy,
    source: "arxiv",
    arxiv_id: arxivPaper.arxiv_id,
    doi: arxivPaper.doi || null,
    pdf_path: null,
    embedding: embedding,
    embedding_status: embedding.length > 0 ? "done" : "failed",
    added_at: new Date().toISOString(),
    deleted: false,
  };
}

// Enrich paper with Semantic Scholar data
async function enrichWithSemanticScholar(
  arxivId: string
): Promise<{ venue?: string; references?: string[]; citedBy?: string[] }> {
  try {
    const { resolvePaperId, getPaperReferences, getPaperCitations } = await import("../crawlers/semantic-scholar.js");

    // Resolve arXiv ID to Semantic Scholar paper ID
    const ssPaperId = await resolvePaperId({ arxiv: arxivId });
    if (!ssPaperId) {
      return {};
    }

    // Get references and citations in parallel
    const [references, citedBy] = await Promise.all([
      getPaperReferences(ssPaperId),
      getPaperCitations(ssPaperId),
    ]);

    return { references, citedBy };
  } catch (e) {
    console.warn("Semantic Scholar enrichment failed for", arxivId, e);
    return {};
  }
}

// Search and index papers from arXiv with full enrichment
export async function searchAndIndexArxiv(
  client: EsClient,
  query: string,
  options?: {
    maxResults?: number;
    yearFrom?: number;
    yearTo?: number;
    venue?: string;
    dryRun?: boolean;
    enrich?: boolean; // Whether to enrich with Semantic Scholar data
  }
): Promise<{ success: number; failed: number; papers: Paper[] }> {
  const { searchArxiv } = await import("../crawlers/arxiv.js");
  const maxResults = options?.maxResults || 20;

  // Search arXiv
  const arxivPapers = await searchArxiv(query, {
    maxResults,
    yearFrom: options?.yearFrom,
    yearTo: options?.yearTo,
  });

  if (arxivPapers.length === 0) {
    return { success: 0, failed: 0, papers: [] };
  }

  // Ensure embedding service is started
  if (!embeddingService.isStarted) {
    await embeddingService.start();
  }

  // Process papers with optional enrichment
  const papers: Paper[] = [];
  let failed = 0;
  for (const arxivPaper of arxivPapers) {
    try {
      const textToEmbed = (arxivPaper.title + " " + arxivPaper.abstract).substring(0, 5000);
      let embedding: number[] = [];
      try {
        embedding = await embeddingService.embed(textToEmbed);
      } catch (e) {
        console.warn("Embedding failed for", arxivPaper.arxiv_id, e);
      }

      // Optional enrichment from Semantic Scholar
      let enrichment: { venue?: string; references?: string[]; citedBy?: string[] } = {};
      if (options?.enrich !== false) {
        enrichment = await enrichWithSemanticScholar(arxivPaper.arxiv_id);
      }

      const paper = await transformArxivPaper(arxivPaper, embedding, enrichment);
      papers.push(paper);
    } catch (e) {
      console.error("Failed to process paper", arxivPaper.arxiv_id, e);
      failed++;
    }
  }

  if (options?.dryRun) {
    return { success: papers.length, failed, papers };
  }

  // Bulk index
  const result = await bulkIndexPapers(client, papers);
  return { ...result, papers };
}
