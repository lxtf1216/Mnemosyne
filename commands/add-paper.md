---
description: "Add papers via search, reference expansion, or inbox processing"
---
# /mnemosyne:add-paper

Add papers via search, reference expansion, or inbox processing.

This command has three sub-commands:

## Sub-command 1: --search

Search arXiv and Semantic Scholar, then ingest papers.

```
/mnemosyne:add-paper --search
  --topic      <string>     # Required
  --venue      <string>     # Optional (e.g. NeurIPS, CVPR)
  --year-from  <YYYY>       # Optional
  --year-to    <YYYY>       # Optional
  --max        <number>     # Default: 20
  --dry-run                # Preview without writing
```

### Process
1. Query arXiv API + Semantic Scholar API in parallel
2. Deduplicate by arxiv_id (priority) or doi
3. Skip already-existing papers
4. Generate embeddings
5. Bulk index (batches of 100)

---

## Sub-command 2: --expand

Expand citation graph for specified papers.

```
/mnemosyne:add-paper --expand
  --papers    <id_or_title,...>  # Required, comma-separated
                                  # Supports: arxiv_id, paper_id (UUID), title (fuzzy match)
  --direction references|cited-by|both  # Default: both
  --dry-run
```

### Process
1. Resolve input to paper IDs (fuzzy match title if needed)
2. For each paper, query Semantic Scholar for references/citations
3. Deduplicate and filter
4. Generate embeddings for new papers
5. Bulk index

---

## Sub-command 3: --from-inbox

Process PDFs in the inbox directory.

```
/mnemosyne:add-paper --from-inbox
  --dry-run    # Preview which files will be processed
```

### Inbox Directory
Default: `inbox/` (relative to project root)
Override: `MNEMOSYNE_INBOX_DIR` env var

### Process
1. Scan inbox/ for *.pdf files (non-recursive)
2. For each PDF:
   - Parse with MinerU (API if token, else local)
   - Extract fields (title, authors, abstract, etc.)
   - Generate embedding
   - Write to ES
3. Success: Move to `inbox/processed/`
4. Failure: Leave in inbox/, append error to `inbox/errors.log`

### Field Extraction Priority
1. arXiv API (most reliable for arXiv papers)
2. Semantic Scholar API
3. MinerU PDF parsing (for inbox)

## Deduplication
- Check by arxiv_id first, then doi
- Skip if exists, do NOT overwrite

## Examples
```
/mnemosyne:add-paper --search --topic "diffusion model image generation" --max 10
/mnemosyne:add-paper --expand --papers "2501.09754, my paper title"
/mnemosyne:add-paper --from-inbox
```
