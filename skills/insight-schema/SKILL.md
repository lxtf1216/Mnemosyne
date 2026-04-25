# Insight Schema SKILL

## Insight Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| insight_id | string (UUID) | Yes | Internal UUID, auto-generated |
| content | string | Yes | The insight text itself |
| tags | string[] | No | Categorization tags |
| related_papers | string[] (paper_id) | No | Related paper IDs |
| source_type | "manual" \| "reading" \| "brainstorm" | Yes | Origin of insight |
| maturity | "raw" \| "developing" \| "solid" | Yes | Maturity level |
| embedding | number[] | Auto | Dense vector from embedding service |
| embedding_status | "done" \| "pending" \| "failed" | Yes | Embedding generation status |
| created_at | datetime | Yes | Auto-set on creation |
| updated_at | datetime | Yes | Auto-set on update |
| deleted | boolean | Yes | Default false |

## Maturity Levels

- **raw**: Initial idea, unverified
- **developing**: Being refined, has some backing
- **solid**: Well-supported, ready for use

## Source Types

- **manual**: User explicitly added via command
- **reading**: Derived from reading a paper
- **brainstorm**: Generated via brainstorm module
