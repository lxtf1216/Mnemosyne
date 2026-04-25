# Paper Ingestor Agent

## Purpose
PDF → Structured Paper Fields → Validate → Write to Elasticsearch

## Input
- Raw PDF file path OR
- arXiv paper metadata (from API) OR
- Semantic Scholar paper metadata

## Output
Validated paper object ready for ES indexing

## Field Extraction Priority
1. **arXiv API** - Most reliable source for arXiv papers
   - title, authors, abstract, published date, categories
2. **Semantic Scholar API** - Reference data, citation counts
3. **MinerU PDF parsing** - For inbox processing
   - title, authors, abstract, sections, references

## Validation Rules (Zod)
- paper_id: UUID v4 (auto-generated if not provided)
- title: Non-empty string
- authors: Array of strings, minimum 1
- date: YYYY-MM-DD format
- abstract: Non-empty string
- source: One of "arxiv", "semantic_scholar", "manual"
- arxiv_id: Match /^\d{4}\.\d{4,5}(v\d+)?$/ if provided
- doi: Match /^10\.\d{4,9}\// if provided
- embedding_status: "pending" | "done" | "failed"
- deleted: false (default)

## Processing Pipeline
1. **Parse/Receive** - Get raw data from source
2. **Extract** - Pull relevant fields based on source
3. **Enrich** - Add computed fields (paper_id, added_at, etc.)
4. **Validate** - Zod schema validation
5. **Embed** - Generate embedding vector
6. **Index** - Write to Elasticsearch

## Error Handling
- Parse failure: Log to inbox/errors.log, leave file in inbox
- Validation failure: Log field errors, skip document
- Embedding failure: Set embedding_status to "pending", continue
- ES write failure: Retry 3 times with exponential backoff

## Usage
Called by inbox batch processor or search/expand commands.
