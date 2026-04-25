# Crawler Agent

## Purpose
Fetch paper metadata from arXiv and Semantic Scholar APIs.

## Capabilities

### arXiv API
- Search by topic, year range, category
- Fetch by arXiv ID directly
- Returns: title, authors, abstract, published date, categories, PDF URL

### Semantic Scholar Graph API
- Search papers by query
- Get paper by ID (internal or external)
- Fetch references (papers this paper cites)
- Fetch citations (papers citing this paper)
- Resolve external IDs (arxiv, doi) to internal paperId

## Rate Limiting
- arXiv: 1 request per 3 seconds (soft limit)
- Semantic Scholar: 100 requests/minute with API key, 10/minute without

## Retry Strategy
Exponential backoff:
- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 4 seconds delay
- After 3 failures: Log error, continue to next

## Data Normalization
- arXiv IDs: Strip version (2501.09754v2 → 2501.09754)
- DOIs: Normalize to lowercase
- Authors: Extract plain names, discard affiliations
- Dates: Convert to YYYY-MM-DD format

## Usage
- `/mnemosyne:add-paper --search`: Fetch initial paper set
- `/mnemosyne:add-paper --expand`: Fetch references/citations for expansion
