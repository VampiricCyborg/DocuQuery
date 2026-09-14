FROM python:3.13-slim AS base

# System deps: libmupdf for PyMuPDF, libgomp for sentence-transformers FAISS
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pin HuggingFace cache to /app/.cache so build-time and runtime use the same location
ENV HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_CACHE=/app/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/sentence-transformers

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the embedding model into the image cache
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"

COPY . .

# Create uploads dir and appuser, then transfer cache ownership so runtime can read it
RUN mkdir -p uploads .cache && \
    useradd -m appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Single worker to avoid duplicating the embedding model in RAM
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "30"]
