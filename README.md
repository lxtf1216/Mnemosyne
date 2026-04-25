# Mnemosyne

> 记忆女神 - AI Research Assistant Claude Code Plugin

A research assistant that connects to a local Elasticsearch instance to help researchers with literature retrieval, knowledge accumulation, and idea incubation.

## Features

- **Paper Management**: Search, import, and manage academic papers from arXiv and Semantic Scholar
- **Insight Tracking**: Capture and organize research insights with maturity levels
- **Hybrid Search**: Combine keyword and semantic similarity search
- **Citation Graph**: Expand papers by references or citations
- **Brainstorming**: AI-assisted idea generation based on your knowledge base
- **PDF Processing**: Parse PDFs from inbox directory automatically

## Setup

### Prerequisites
- Node.js 18+
- Python 3.9+
- Elasticsearch 8.x running on `localhost:9200`
- (Optional) HuggingFace embedding model

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

4. Download an embedding model:
   - Recommended: [Qwen/Qwen3-Embedding](https://huggingface.co/Qwen/Qwen3-Embedding)
   - Place in `embedding_model/` directory

5. Start Elasticsearch:
   ```bash
   docker run -d -p 9200:9200 -e "discovery.type=single-node" elasticsearch:8.11.0
   ```

### Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Load as plugin
claude --plugin-dir .
```

## Commands

| Command | Description |
|---------|-------------|
| `/mnemosyne:status` | Check ES connection and index status |
| `/mnemosyne:search` | Hybrid search for papers and insights |
| `/mnemosyne:add-paper --search` | Search and import papers |
| `/mnemosyne:add-paper --expand` | Expand citation graph |
| `/mnemosyne:add-paper --from-inbox` | Process PDFs in inbox |
| `/mnemosyne:add-insight` | Add a new insight |
| `/mnemosyne:brainstorm` | Generate research ideas |
| `/mnemosyne:reembed` | Re-generate pending embeddings |

## Project Structure

```
mnemosyne/
├── commands/          # Slash command definitions
├── agents/            # Sub-agents for specialized tasks
├── skills/            # Domain knowledge (ES, schemas)
├── src/
│   ├── elasticsearch/ # ES operations
│   ├── embedding/     # Embedding service
│   ├── parsers/       # PDF parsing
│   └── crawlers/      # API clients
├── inbox/             # PDF drop directory
└── embedding_model/   # HuggingFace models
```

## License

MIT
