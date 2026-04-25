# Paper Schema SKILL

## Paper Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| paper_id | string (UUID) | Yes | Internal UUID, auto-generated |
| title | string | Yes | Extracted from PDF/API |
| authors | string[] | Yes | Array of author names |
| date | YYYY-MM-DD | Yes | Publication date |
| venue | string | No | e.g. "NeurIPS 2024" |
| keywords | string[] | No | Extracted or provided |
| abstract | string | Yes | Full abstract text |
| method_description | string | No | Methods section content |
| datasets | string[] | No | Dataset names mentioned |
| experiment_description | string | No | Experiments section content |
| references | string[] (paper_id) | No | Related paper IDs |
| cited_by | string[] (paper_id) | No | Papers citing this one |
| source | "arxiv" \| "semantic_scholar" \| "manual" | Yes | Import source |
| arxiv_id | string \| null | No | arXiv identifier |
| doi | string \| null | No | DOI |
| pdf_path | string \| null | No | Relative to project root |
| embedding | number[] | Auto | Dense vector from embedding service |
| embedding_status | "done" \| "pending" \| "failed" | Yes | Embedding generation status |
| added_at | datetime | Yes | Auto-set on insertion |
| deleted | boolean | Yes | Default false |

## Extraction Priority

1. **arXiv API** - Most reliable for arXiv papers
2. **Semantic Scholar API** - Good coverage, reference data
3. **MinerU PDF parsing** - For inbox processing

## Validation
- Use Zod schema for validation before ES write
- arxiv_id format: `YYMM.NNNNvN` (e.g., `2501.09754v2`)
- doi format: `10.XXXXX/...`
