---
description: "Check ES connection, index status, document counts; auto-initialize index on first run"
---

# /mnemosyne:status

Check Elasticsearch connection status, index information, and document counts.

## Usage
```
/mnemosyne:status
```

## Output
- ES connection status (connected/disconnected)
- Papers index document count
- Insights index document count
- Embedding dimension (if available)
- Index initialization status

## First Run Behavior
On first run (when indexes don't exist):
1. Start embedding service to detect model dimension
2. Auto-create `papers` index with proper mapping (including embedding field with correct dimension)
3. Auto-create `insights` index with proper mapping
4. Return status information

## Error Handling
- ES not running: Display clear error message with instructions
- Embedding model missing: Error with instructions to download from HuggingFace
- Index creation fails: Show error details

## Example Output
```
✅ Elasticsearch: Connected
📄 Papers: 142 documents
💡 Insights: 28 documents
🔢 Embedding dimension: 1024
📦 Indexes: Initialized
```
