---
description: "Hybrid keyword + semantic search for papers and insights"
---
# /mnemosyne:search

Hybrid keyword + semantic search across papers and insights.

## Usage
```
/mnemosyne:search "<query>"
  --type    papers|insights|all   # Default: all
  --venue   <string>            # Filter by venue (e.g. NeurIPS, CVPR)
  --year    <YYYY>             # Filter by year
  --tags    <tag1,tag2>         # Filter by tags (for insights)
  --limit   <number>           # Default: 10
```

## Search Strategy
Uses Elasticsearch `multi_match` (BM25) combined with `knn` (dense vector)
in a Reciprocal Rank Fusion (RRF) ranking:
- BM25 keyword match on title, abstract, method_description
- kNN semantic match on embedding vector
- Final ranking: RRF(BM25_score, knn_score) with equal weight (0.5 each)

## Output Format
Papers:
- Title (venue, year)
- Authors
- Abstract (truncated to 200 chars)
- Relevance score

Insights:
- Content
- Tags, maturity
- Related papers (if any)

## Examples
```
/mnemosyne:search "self-supervised learning"
/mnemosyne:search "vision transformer" --type papers --venue CVPR --limit 5
/mnemosyne:search "novelty detection" --type insights --tags important
```

## Notes
- If embedding service is unavailable, falls back to keyword-only search
- Results sorted by combined relevance score
- Soft-deleted documents (deleted: true) are excluded
