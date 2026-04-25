#!/usr/bin/env python3
"""
Embedding service - loads HuggingFace sentence-transformers model
and exposes embed(text) via stdin/stdout JSON protocol.
"""

import sys
import json
import os
from pathlib import Path

def find_model():
    """Find the first model directory in embedding_model/"""
    # Project root is 3 levels up from embed.py: embedding/ -> src/ -> project_root/
    model_dir = Path(__file__).parent.parent.parent / "embedding_model"
    if not model_dir.exists():
        return None
    for item in sorted(model_dir.iterdir()):
        if item.is_dir():
            return item
    return None

def load_model():
    """Load sentence-transformers model"""
    from sentence_transformers import SentenceTransformer

    model_path = find_model()
    if not model_path:
        raise FileNotFoundError(
            "No embedding model found in embedding_model/. "
            "Download a model from HuggingFace (e.g. Qwen/Qwen3-Embedding) "
            "and place it in the embedding_model/ directory."
        )

    print(f"Loading model from {model_path}", file=sys.stderr)
    model = SentenceTransformer(str(model_path))
    return model

def embed_text(model, text: str) -> list:
    """Generate embedding for a single text"""
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()

def embed_batch(model, texts: list[str]) -> list[list]:
    """Generate embeddings for multiple texts"""
    embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return embeddings.tolist()

def main():
    model = load_model()

    # Protocol: read JSON from stdin, write JSON to stdout
    # { "type": "embed", "text": "..." }
    # { "type": "embed_batch", "texts": [...] }
    # { "type": "dim" }
    # Response: { "embedding": [...] } or { "embeddings": [...] } or { "dim": N }

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            msg_type = msg.get("type")

            if msg_type == "dim":
                # Probe with a dummy text to detect dimension
                dummy_emb = model.encode("dimension check", normalize_embeddings=True)
                dim = len(dummy_emb)
                # Echo back _seq if provided for init detection
                response = {"dim": dim}
                if "_seq" in msg:
                    response["_seq"] = msg["_seq"]
                print(json.dumps(response), flush=True)

            elif msg_type == "embed":
                text = msg.get("text", "")
                embedding = embed_text(model, text)
                response = {"embedding": embedding}
                if "_seq" in msg:
                    response["_seq"] = msg["_seq"]
                print(json.dumps(response), flush=True)

            elif msg_type == "embed_batch":
                texts = msg.get("texts", [])
                embeddings = embed_batch(model, texts)
                response = {"embeddings": embeddings}
                if "_seq" in msg:
                    response["_seq"] = msg["_seq"]
                print(json.dumps(response), flush=True)

            else:
                print(json.dumps({"error": f"Unknown type: {msg_type}"}), flush=True)

        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON"}), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
