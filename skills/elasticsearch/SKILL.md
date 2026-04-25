# Elasticsearch SKILL

## Overview
All ES operations are encapsulated in `src/elasticsearch/`. No raw ES DSL outside this module.

## Papers Index Mapping

```json
{
  "mappings": {
    "properties": {
      "paper_id": { "type": "keyword" },
      "title": { "type": "text", "analyzer": "english" },
      "authors": { "type": "keyword" },
      "date": { "type": "date" },
      "venue": { "type": "keyword" },
      "keywords": { "type": "keyword" },
      "abstract": { "type": "text", "analyzer": "english" },
      "method_description": { "type": "text" },
      "datasets": { "type": "keyword" },
      "experiment_description": { "type": "text" },
      "references": { "type": "keyword" },
      "cited_by": { "type": "keyword" },
      "source": { "type": "keyword" },
      "arxiv_id": { "type": "keyword" },
      "doi": { "type": "keyword" },
      "pdf_path": { "type": "keyword" },
      "embedding": { "type": "dense_vector", "dims": "<detected>", "index": true, "similarity": "cosine" },
      "embedding_status": { "type": "keyword" },
      "added_at": { "type": "date" },
      "deleted": { "type": "boolean" }
    }
  }
}
```

## Insights Index Mapping

```json
{
  "mappings": {
    "properties": {
      "insight_id": { "type": "keyword" },
      "content": { "type": "text" },
      "tags": { "type": "keyword" },
      "related_papers": { "type": "keyword" },
      "source_type": { "type": "keyword" },
      "maturity": { "type": "keyword" },
      "embedding": { "type": "dense_vector", "dims": "<detected>", "index": true, "similarity": "cosine" },
      "embedding_status": { "type": "keyword" },
      "created_at": { "type": "date" },
      "updated_at": { "type": "date" },
      "deleted": { "type": "boolean" }
    }
  }
}
```

## Deduplication Rules
- Papers: Check by `arxiv_id` (priority) or `doi` first. Skip if exists, do not overwrite.
- Insights: No deduplication (allow duplicates).

## Soft Delete
- All deletions set `deleted: true`, never actually remove documents.

## Bulk Operations
- Batch size ≤ 100 documents per `_bulk` call.
- All bulk operations support `--dry-run`.
