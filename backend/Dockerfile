FROM python:3.13-slim AS base

# System deps: libmupdf for PyMuPDF, libgomp for onnxruntime's OpenMP threading
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the pinned ONNX embedding model + tokenizer into the image
# (stdlib-only script -- no huggingface_hub dependency needed)
COPY scripts/download_embedding_model.py scripts/download_embedding_model.py
RUN python scripts/download_embedding_model.py models/bge-small-en-v1.5-onnx-int8

COPY . .

# Create uploads dir and appuser, then transfer ownership so runtime can read it
RUN mkdir -p uploads && \
    useradd -m appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Single worker to avoid duplicating the embedding model in RAM.
# Runs Alembic migrations before starting the server -- schema management is
# exclusively through Alembic (no more Base.metadata.create_all()). Railway's
# railway.json sets its own startCommand which overrides this CMD entirely;
# this is what local `docker-compose`/`docker run` actually executes.
CMD ["/bin/sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-keep-alive 30"]
