---
description: "Re-embed all documents with pending embedding status"
---
# /mnemosyne:reembed

Re-generate embeddings for all documents with `embedding_status: "pending"` or `"failed"`.

## Usage
```
/mnemosyne:reembed
  --type    papers|insights|all  # Default: all
  --dry-run                    # Show what would be re-embedded without doing it
```

## Process
1. Query ES for all documents with `embedding_status: "pending"` or `"failed"`
2. For each document:
   - Extract text field (abstract for papers, content for insights)
   - Generate new embedding
   - Update document with embedding and status "done"
3. Report success/failure counts

## Use Cases
- Embedding service was down during initial indexing
- Model was changed (new model = new dimension)
- Embeddings failed during initial processing

## Examples
```
/mnemosyne:reembed
/mnemosyne:reembed --type papers --dry-run
/mnemosyne:reembed --type insights
```

## Notes
- Documents with empty text fields will be marked "failed"
- Batch processing in groups of 100
- Non-blocking: one failed document doesn't stop the batch
