# Dependencies Verification

**Last Verified:** September 20, 2026

## Scope

This document records the mapping between third-party Python packages imported
across the backend and the entries in `requirements.txt`. It is a manual audit, so
it is only as current as the date above — re-run the commands at the bottom after
changing dependencies.

## Imported directly by the code

| Import statement | Package in requirements.txt | Version |
|---|---|---|
| `import fastapi` / `from fastapi import ...` | `fastapi` | 0.115.5 |
| `from pydantic import ...` | `pydantic` | 2.10.3 |
| `from pydantic_settings import ...` | `pydantic-settings` | 2.6.1 |
| `from sqlalchemy import ...` | `sqlalchemy[asyncio]` | 2.0.36 |
| `from alembic import ...` | `alembic` | 1.14.0 |
| `from pgvector.sqlalchemy import ...` | `pgvector` | 0.5.0 |
| `import aiofiles` | `aiofiles` | 24.1.0 |
| `import fitz` | `pymupdf` | 1.24.14 |
| `from docx import ...` | `python-docx` | 1.1.2 |
| `from langchain_text_splitters import ...` | `langchain-text-splitters` | 1.1.2 |
| `import onnxruntime` | `onnxruntime` | 1.30.0 |
| `from tokenizers import ...` | `tokenizers` | 0.23.2 |
| `import numpy` | `numpy` | 2.5.3 |
| `import psutil` | `psutil` | 6.1.1 |
| `from slowapi import ...` | `slowapi` | 0.1.9 |
| `import httpx` | `httpx` | 0.28.1 |
| `from groq import ...` | `groq` | 0.13.1 |
| `from openai import ...` | `openai` | 1.57.4 |
| `from anthropic import ...` | `anthropic` | 0.40.0 |
| `import google.generativeai` | `google-generativeai` | 0.8.3 |
| `import pytest` | `pytest` | 9.1.1 |

`from starlette... import ...` also appears in `app/core/middleware.py`. Starlette is a
direct dependency of FastAPI and is installed with it, so it has no line of its own.

## Required but never imported

These are real runtime requirements that no source file imports by name, which is why
they cannot be found by grepping for import statements:

| Package | Why it is needed |
|---|---|
| `uvicorn[standard]` | The ASGI server, invoked as a command by the Dockerfile and `railway.json` |
| `python-multipart` | FastAPI parses `multipart/form-data` uploads through it |
| `asyncpg` | The driver behind the `postgresql+asyncpg://` URL |
| `psycopg2-binary` | `migrations/env.py` swaps to `+psycopg2` to render Alembic's offline SQL |
| `greenlet` | SQLAlchemy's async bridge |
| `python-dotenv` | How `pydantic-settings` reads `.env` |
| `pytest-asyncio` | A pytest plugin, enabled via `asyncio_mode = auto` in `pytest.ini` |

## Embeddings: ONNX Runtime, not sentence-transformers

Earlier revisions of this document listed `sentence-transformers` (and, transitively,
PyTorch) as the embedding dependency. **That is no longer true and should not be
reintroduced.** The PyTorch stack was deliberately removed because loading it
exhausted memory on Railway's container and crashed the service on boot.

Embeddings now run through `onnxruntime` and `tokenizers` against a quantised
`BAAI/bge-small-en-v1.5` INT8 model (~35MB), downloaded into the image at build time
by `scripts/download_embedding_model.py`. See `app/ingestion/embeddings.py`.

## Coverage summary

- **Packages in `requirements.txt`:** 28
- **Imported directly:** 21 (plus Starlette, which ships with FastAPI)
- **Required without being imported:** 7
- **Unaccounted for:** 0

## Verification commands

Confirm every directly imported package resolves:

```bash
cd backend
pip install -r requirements.txt
python -c "import fastapi, sqlalchemy, pgvector, onnxruntime, tokenizers, numpy, psutil, groq, openai, anthropic, google.generativeai"
```

Confirm runtime dependencies are satisfied end to end:

```bash
cd backend
pytest -q
```

The suite mocks the database and the embedding service, so it needs no PostgreSQL
instance and no downloaded model — which is what lets CI run it with no services
attached. A green run is the real check here; the count changes too often to record.
