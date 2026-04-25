import { z } from "zod";
import { esRequest, getEsClient, paperIdSchema, insightSourceSchema, maturitySchema, embeddingStatusSchema, EsClient } from "./client.js";

export const insightSchema = z.object({
  insight_id: z.string().uuid(),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  related_papers: z.array(z.string()).optional(),
  source_type: insightSourceSchema,
  maturity: maturitySchema,
  embedding: z.array(z.number()).optional(),
  embedding_status: embeddingStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted: z.boolean().default(false),
});

export type Insight = z.infer<typeof insightSchema>;

export const INSIGHTS_INDEX = "insights";

export async function initInsightsIndex(client: EsClient, embeddingDim: number): Promise<void> {
  try {
    await esRequest<any>(client, "GET", `/${INSIGHTS_INDEX}`);
  } catch (e: any) {
    if (e.message.includes("404")) {
      await esRequest(client, "PUT", `/${INSIGHTS_INDEX}`, {
        mappings: {
          properties: {
            insight_id: { type: "keyword" },
            content: { type: "text" },
            tags: { type: "keyword" },
            related_papers: { type: "keyword" },
            source_type: { type: "keyword" },
            maturity: { type: "keyword" },
            embedding: { type: "dense_vector", dims: embeddingDim, index: true, similarity: "cosine" },
            embedding_status: { type: "keyword" },
            created_at: { type: "date" },
            updated_at: { type: "date" },
            deleted: { type: "boolean" },
          },
        },
      });
      return;
    }
    throw e;
  }
}

export async function indexInsight(client: EsClient, insight: Insight): Promise<void> {
  await esRequest(client, "PUT", `/${INSIGHTS_INDEX}/_doc/${insight.insight_id}`, insight);
}

export async function getInsightsCount(client: EsClient): Promise<number> {
  const res = await esRequest<{ count: number }>(client, "GET", `/${INSIGHTS_INDEX}/_count`);
  return res.count;
}

export async function searchInsights(
  client: EsClient,
  query: string,
  options?: {
    tags?: string[];
    limit?: number;
  }
): Promise<Insight[]> {
  const limit = options?.limit || 10;

  const must: any[] = [
    {
      bool: {
        should: [
          { multi_match: { query, fields: ["content", "tags"], type: "best_fields" } },
        ],
      },
    },
    { term: { deleted: false } },
  ];

  if (options?.tags && options.tags.length > 0) {
    must.push({ terms: { tags: options.tags } });
  }

  const res = await esRequest<{ hits: { hits: { _source: Insight }[] } }>(client, "POST", `/${INSIGHTS_INDEX}/_search`, {
    size: limit,
    query: { bool: { must } },
  });

  return res.hits.hits.map((h) => h._source);
}

export async function hybridSearchInsights(
  client: EsClient,
  query: string,
  queryVector: number[],
  options?: { tags?: string[]; limit?: number }
): Promise<Insight[]> {
  const limit = options?.limit || 10;

  const must: any[] = [
    {
      bool: {
        should: [
          { multi_match: { query, fields: ["content", "tags"], type: "best_fields" } },
        ],
      },
    },
    { term: { deleted: false } },
  ];

  if (options?.tags && options.tags.length > 0) {
    must.push({ terms: { tags: options.tags } });
  }

  const res = await esRequest<{ hits: { hits: { _source: Insight }[] } }>(client, "POST", `/${INSIGHTS_INDEX}/_search`, {
    size: limit,
    query: { bool: { must } },
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

export async function getPendingEmbeddings(client: EsClient, type: "papers" | "insights"): Promise<{ id: string; content: string }[]> {
  const index = type === "papers" ? "papers" : "insights";
  const idField = type === "papers" ? "paper_id" : "insight_id";
  const contentField = type === "papers" ? "abstract" : "content";

  const res = await esRequest<{ hits: { hits: { _id: string; _source: any }[] } }>(client, "POST", `/${index}/_search`, {
    size: 100,
    query: {
      bool: {
        must: [
          { term: { embedding_status: "pending" } },
          { term: { deleted: false } },
        ],
      },
    },
    _source: [idField, contentField],
  });

  return res.hits.hits.map((h) => ({ id: h._id, content: h._source[contentField] }));
}

export async function updateEmbeddingStatus(
  client: EsClient,
  type: "papers" | "insights",
  id: string,
  status: "done" | "pending" | "failed",
  embedding?: number[]
): Promise<void> {
  const index = type === "papers" ? "papers" : "insights";
  const updateDoc: any = { embedding_status: status };
  if (embedding) {
    updateDoc.embedding = embedding;
  }

  await esRequest(client, "PUT", `${index}/_update/${id}`, { doc: updateDoc });
}
