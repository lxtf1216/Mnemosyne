#!/usr/bin/env python3
"""Local MinerU parser fallback"""

import sys
import json
from pathlib import Path

def parse_pdf(pdf_path: str) -> dict:
    try:
        from mineru import parse_pdf

        result = parse_pdf(pdf_path)
        # Convert to serializable format
        return {
            "title": result.get("title", ""),
            "authors": result.get("authors", []),
            "abstract": result.get("abstract", ""),
            "sections": result.get("sections", []),
            "references": result.get("references", []),
        }
    except ImportError as e:
        return {"error": f"ImportError: {e}"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: mineru_local.py <pdf_path>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    result = parse_pdf(pdf_path)
    print(json.dumps(result))
