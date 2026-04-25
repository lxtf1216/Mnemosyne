export interface ArxivPaper {
  arxiv_id: string; // e.g. "2501.09754v2"
  title: string;
  authors: string[];
  abstract: string;
  published: string; // YYYY-MM-DD
  updated?: string;
  categories: string[];
  pdf_url: string;
  doi?: string;
  comments?: string;
  journal_ref?: string;
}

const ARXIV_API = "http://export.arxiv.org/api/query";

export async function searchArxiv(
  query: string,
  options?: {
    start?: number;
    maxResults?: number;
    yearFrom?: number;
    yearTo?: number;
    categories?: string[];
  }
): Promise<ArxivPaper[]> {
  const maxResults = options?.maxResults || 20;
  const start = options?.start || 0;

  let searchQuery = query;
  if (options?.categories && options.categories.length > 0) {
    const catQuery = options.categories.map((c) => `cat:${c}`).join("+OR+");
    searchQuery = `(${query})+AND+(${catQuery})`;
  }

  if (options?.yearFrom) {
    searchQuery += `+AND+submittedDate:[${options.yearFrom}0101+TO+${options.yearTo || new Date().getFullYear()}1231]`;
  }

  const url = `${ARXIV_API}?search_query=all:${encodeURIComponent(searchQuery)}&start=${start}&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`arXiv API error: ${response.status}`);
  }

  const text = await response.text();
  return parseArxivAtom(text);
}

function parseArxivAtom(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Simple regex-based parsing since we don't want to add XML dependencies
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const idMatch = /<id>(.*?)<\/id>/.exec(entry);
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
    const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry);
    const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry);
    const updatedMatch = /<updated>([\s\S]*?)<\/updated>/.exec(entry);
    const pdfMatch = /<link[^>]*title="pdf"[^>]*href="([^"]*)"/.exec(entry) || /<link[^>]*href="([^"]*pdf[^"]*)"/.exec(entry);
    const doiMatch = /<arxiv:doi>(.*?)<\/arxiv:doi>/.exec(entry) || /<doi>(.*?)<\/doi>/.exec(entry);
    const commentsMatch = /<arxiv:comment>([\s\S]*?)<\/arxiv:comment>/.exec(entry);
    const journalRefMatch = /<arxiv:journal_ref>([\s\S]*?)<\/arxiv:journal_ref>/.exec(entry);
    const categoryMatches = [...entry.matchAll(/<category[^>]*term="([^"]*)"[^>]*\/>/g)];

    const authorMatches = [...entry.matchAll(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g)];

    if (idMatch) {
      // Extract arxiv ID from URL like http://arxiv.org/abs/2501.09754v2
      // Need to match the full ID including version
      const absMatch = /abs\/(\d+\.\d+[vV]\d+|\d+\/\d+)/.exec(idMatch[1]);
      const arxiv_id = absMatch ? absMatch[1] : idMatch[1].split("/").pop() || "";

      papers.push({
        arxiv_id,
        title: titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "",
        authors: authorMatches.map((m) => m[1].replace(/\s+/g, " ").trim()),
        abstract: summaryMatch ? summaryMatch[1].replace(/\s+/g, " ").trim() : "",
        published: publishedMatch ? publishedMatch[1].substring(0, 10) : "",
        updated: updatedMatch ? updatedMatch[1].substring(0, 10) : undefined,
        categories: categoryMatches.map((m) => m[1]),
        pdf_url: pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${arxiv_id}.pdf`,
        doi: doiMatch ? doiMatch[1].trim() : undefined,
        comments: commentsMatch ? commentsMatch[1].replace(/\s+/g, " ").trim() : undefined,
        journal_ref: journalRefMatch ? journalRefMatch[1].replace(/\s+/g, " ").trim() : undefined,
      });
    }
  }

  return papers;
}

export async function getArxivById(arxivId: string): Promise<ArxivPaper | null> {
  try {
    const url = `${ARXIV_API}?id_list=${arxivId}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const text = await response.text();
    const papers = parseArxivAtom(text);
    return papers[0] || null;
  } catch {
    return null;
  }
}
