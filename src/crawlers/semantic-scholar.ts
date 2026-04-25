const SS_API = "https://api.semanticscholar.org/graph/v1";
const SS_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;

export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  authors: { authorId: string; name: string }[];
  abstract?: string;
  year?: number;
  venue?: string;
  citationCount?: number;
  openAccessPdf?: { url: string };
  externalIds?: { ArXiv?: string; DOI?: string };
}

export interface SemanticScholarAuthor {
  authorId: string;
  name: string;
  papers: { paperId: string; title: string; year?: number }[];
}

async function ssRequest<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SS_API}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SS_KEY) {
    headers["x-api-key"] = SS_KEY;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`Semantic Scholar API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function searchSemanticScholar(
  query: string,
  options?: {
    yearFrom?: number;
    yearTo?: number;
    venue?: string;
    limit?: number;
  }
): Promise<SemanticScholarPaper[]> {
  const fields = ["paperId", "title", "authors", "abstract", "year", "venue", "openAccessPdf", "externalIds", "citationCount"];

  const params: Record<string, string> = {
    query,
    fields: fields.join(","),
    limit: String(options?.limit || 20),
  };

  // Note: Semantic Scholar doesn't support venue/year filtering in search API directly
  // We'll filter after fetching

  const res = await ssRequest<{ data: SemanticScholarPaper[] }>("/Paper/search", params);

  let papers = res.data || [];

  if (options?.yearFrom) {
    papers = papers.filter((p) => p.year && p.year >= options.yearFrom!);
  }
  if (options?.yearTo) {
    papers = papers.filter((p) => p.year && p.year <= options.yearTo!);
  }
  if (options?.venue) {
    papers = papers.filter((p) => p.venue?.toLowerCase().includes(options.venue!.toLowerCase()));
  }

  return papers;
}

export async function getPaperById(paperId: string): Promise<SemanticScholarPaper | null> {
  try {
    const fields = ["paperId", "title", "authors", "abstract", "year", "venue", "openAccessPdf", "externalIds", "citationCount"];
    return await ssRequest<SemanticScholarPaper>(`/Paper/${paperId}`, { fields: fields.join(",") });
  } catch {
    return null;
  }
}

export async function getPaperReferences(paperId: string): Promise<string[]> {
  try {
    const res = await ssRequest<{ data: { paperId: string }[] }>(`/Paper/${paperId}/references`, {
      fields: "paperId",
      limit: "100",
    });
    return res.data.map((r) => r.paperId);
  } catch {
    return [];
  }
}

export async function getPaperCitations(paperId: string): Promise<string[]> {
  try {
    const res = await ssRequest<{ data: { paperId: string }[] }>(`/Paper/${paperId}/citations`, {
      fields: "paperId",
      limit: "100",
    });
    return res.data.map((r) => r.paperId);
  } catch {
    return [];
  }
}

export async function resolvePaperId(externalId: { arxiv?: string; doi?: string }): Promise<string | null> {
  if (externalId.arxiv) {
    // Remove version suffix (e.g., "2408.08544v1" -> "2408.08544")
    const cleanArxivId = externalId.arxiv.replace(/v\d+$/, "");
    const res = await ssRequest<{ paperId: string }>("/Paper/arXiv:" + cleanArxivId, { fields: "paperId" });
    return res.paperId;
  }
  if (externalId.doi) {
    const res = await ssRequest<{ paperId: string }>("/Paper/DOI:" + externalId.doi, { fields: "paperId" });
    return res.paperId;
  }
  return null;
}
