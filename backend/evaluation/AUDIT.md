# DocuQuery quantitative audit

Audit date: 2026-09-20 · Branch `docs/refresh-dependency-verification` · Commit `0f876bb`

Every number below is either read directly out of the repository or produced by a
script in this folder. Raw output for each measured figure is in `results/`.
Nothing here is estimated, extrapolated, or carried over from the README.

Measurement machine: Windows 11, Python 3.13.1, onnxruntime 1.30.0,
PostgreSQL 16.14 + pgvector 0.8.5 in Docker (`backend-db-1`, port 5433).

---

## 1. What could NOT be measured, and why

State these plainly rather than working around them.

| Metric | Why not |
|---|---|
| Recall@1/3/5, Precision@k, MRR, NDCG@k, Hit Rate | **No document corpus exists in the repository.** Zero PDFs, zero DOCX. The only file in `backend/uploads/` is a 51-byte auth test stub. The harness to compute all of these is built and proven (§5); it needs documents. |
| Answer correctness | No ground-truth QA dataset exists, and none can be derived without a corpus. |
| Test coverage % | No `coverage` or `pytest-cov` in `backend/requirements.txt`. No coverage measurement has ever been run. |
| Cloud cost, $/query, $/document | No billing export, no usage dashboard data in the repo. |
| Real users, sessions, uploads, queries served | No analytics, no request logs retained, no production telemetry. |
| Prompt-injection defence rate | No adversarial test set exists. |

---

## 2. Verified metric table

### 2a. Measured this session (new experiments)

| Metric | Value | Unit | What was measured | Evidence | Reproducible | Resume value |
|---|---|---|---|---|---|---|
| Backend tests passing | 79 / 79 | tests | Full suite, 0 failures | `pytest -q`, 129.1 s | High | Medium |
| Embedding throughput, batch 32 | 4.4 | embeddings/s | 128 real passages, ONNX INT8, 1 CPU thread | `results/perf_bench_smoke.json` | High | High |
| Embedding throughput, batch 1 | 0.7 | embeddings/s | same texts, unbatched | same | High | High |
| Batching speed-up (32 vs 1) | 6.17× | ratio | 178.4 s → 28.9 s for 128 texts | same | High | **Very high** |
| Batch 64 regression | 3.43× slower | ratio | 28.9 s → 99.1 s vs batch 32 | same | High | **Very high** |
| Query embedding latency | 9.4 / 16.1 / 59.1 | ms P50/P95/P99 | `embed_query()`, n=24 | same | High | High |
| Retrieval latency, end to end | 11.8 / 14.1 / 389.2 | ms P50/P95/P99 | `run_retrieval_pipeline()` incl. pgvector HNSW, n=24 | same | High | **Very high** |
| Retrieval throughput @ concurrency 8 | 24.8 | queries/s | wall-clock, n=2 — **thin sample, re-run on a real corpus** | same | High | Medium |
| LLM time to first token | 194–429 | ms | Groq streaming, n=2 — **thin sample** | same | Medium | High |
| LLM end-to-end answer latency | 318–478 | ms | retrieval + generation, n=2 — **thin sample** | same | Medium | High |
| ONNX session load | 295 | ms | `EmbeddingService.warm_up()` | `results/ingest_*.json` | High | Medium |
| First ONNX inference | 6.2 | ms | after session load | same | High | Low |
| `langchain_text_splitters` cold import | ~17,200 | ms | first `chunk_pages()` call in a process | same | High | Medium |
| Per-chunk embedding cost | ~146 | ms/chunk | 20 chunks in 2,911 ms at batch 32 | same | High | High |
| Parse + clean + chunk (markdown) | < 2 | ms | 11,720 chars | same | High | Low |
| Vector insert (20 chunks) | 65 | ms | `store_chunks()` + commit | same | High | Medium |
| Process RSS with model loaded | 485 → 870 | MB | before / after embedding 30 chunks | same | High | Medium |

### 2b. Read from the repository (existing evidence)

| Metric | Value | Unit | Evidence |
|---|---|---|---|
| Embedding dimension | 384 | dims | `app/database/models.py:12`, verified in DB via `vector_dims()` |
| Embedding model on disk | 32.4 | MB | `models/bge-small-en-v1.5-onnx-int8/model.onnx`, 34,014,426 bytes |
| Vector storage per chunk | 1,536 | bytes | 384 dims × 4-byte float32 (pgvector format) |
| Supported file formats | 4 | formats | `app/ingestion/supported_formats.py` — pdf, docx, txt, md |
| API endpoints | 13 | endpoints | `@router.*` decorators in `app/api/` |
| LLM providers | 5 | providers | `app/llm/providers/` — Groq, OpenAI, Anthropic, Gemini, Ollama |
| Chat / retrieval modes | 3 | modes | `docuquery`, `llm`, `hybrid` (`app/llm/prompts.py`) |
| Citation granularity levels | 3 | levels | document_id, page, chunk_index (`app/retrieval/citations.py`) |
| Metadata filter fields | 7 | fields | `app/retrieval/filters.py:_ALLOWED_FILTER_KEYS` |
| Chunk size / overlap | 800 / 120 | chars | `app/core/config.py` |
| Retrieval top-k | 5 | chunks | `retrieval_top_k` |
| Over-fetch factor | 2× | ratio | `fetch_k = top_k * 2` in `retrieval_pipeline.py:80` |
| Similarity threshold | 0.30 | cosine sim | `retrieval_similarity_threshold` |
| Context budget | 3,000 / 12,000 | tokens / chars | `llm_max_context_tokens`, `build_context(max_chars)` |
| Max upload size | 50 | MB | `max_file_size_mb` |
| Password hash iterations | 310,000 | PBKDF2-SHA256 rounds | `app/core/security.py:17` |
| Password salt | 128 | bits | `secrets.token_bytes(16)` |
| Session lifetime | 30 | days | `auth_session_days` |
| Rate limits | 10 / 30 | req/min (upload / chat) | `app/core/config.py` |
| Security headers set | 5 (+ Cache-Control) | headers | `app/core/middleware.py` |
| Alembic migrations | 4 | migrations | `migrations/versions/` |
| Backend application code | 3,280 | lines Python | `backend/app/**/*.py` |
| Frontend application code | 5,864 | lines TS/TSX | `frontend/{app,components,hooks,lib,services,stores,types}` |
| Backend test code | 902 | lines | `backend/tests/` |
| Commits | 54 (43 on `main`) | commits | `git rev-list --count --all` |
| Development span | 2026-05-26 → 2026-09-20 | ~4 months | `git log` |
| CI gates | 5 | jobs/steps | pytest, tsc, lint, build, install — **on an unmerged branch** |

---

## 3. Retrieval evaluation — status per metric

| Metric | Computable now? | What it needs |
|---|---|---|
| Recall@1 / @3 / @5 | No | A document corpus. Harness ready. |
| Precision@k | No | Same. |
| MRR | No | Same. |
| Hit Rate@5 | No | Same. Note: with one relevant page per query, Hit Rate@5 **is** Recall@5 — they are not two independent results. |
| NDCG@k | No | Same. |
| Page / citation retrieval accuracy | No | Same, and the corpus must be **multi-page** — Markdown and TXT parse to a single page, so page-level accuracy is only distinguishable from document-level on PDFs. |
| Chunk / answer-span accuracy | No | Same. |
| Answer correctness | No | Human-labelled answers, or an LLM-judge protocol that does not yet exist here. |

> **Cannot calculate any of these from the current repository because there is no ground-truth dataset and no document corpus.**

The harness that computes all of them is written, wired to the real pipeline,
and **proven end to end** on a 4-file throwaway corpus (`results/retrieval_eval_smoke.json`,
n=2 — far too small to report, run only to prove the code path).

---

## 4. Experiment results

### 4a. Embedding batch size — the one real experiment completed

128 identical passages, ONNX INT8 bge-small-en-v1.5, `intra_op_num_threads=1`.

| Batch size | Wall time (s) | Embeddings/s | ms/embedding | vs batch 32 |
|---|---|---|---|---|
| 1 | 178.41 | 0.7 | 1,393.8 | 6.17× slower |
| 8 | 51.87 | 2.5 | 405.2 | 1.79× slower |
| **32 (shipped default)** | **28.93** | **4.4** | **226.0** | — |
| 64 | 99.10 | 1.3 | 774.2 | 3.43× slower |

**Result:** the shipped `EMBEDDING_BATCH_SIZE=32` is optimal on this hardware.
Moving from unbatched to batch-32 is a **6.17× throughput improvement**
(83.8% reduction in wall time). Batch 64 regresses sharply, consistent with
memory pressure on a single-threaded session — which is exactly the constraint
that forced the ONNX rewrite after the PyTorch stack OOM-killed on Railway Free.

Command: `python evaluation/run_perf_bench.py --user-id <id> --eval-set <set>`
Evidence: `results/perf_bench_smoke.json` → `embedding.by_batch_size`

### 4b. Chunking and metadata-filter comparisons

Not run — blocked on the corpus. `run_config_sweep.py` will compare
800/120 (current) against 400/60, 1200/180, and 800/0, plus threshold 0.30 vs 0.00
and with/without a `document_id` metadata filter, on one fixed query set.

---

## 5. Reliability / testing

- **79 tests, 79 passing, 0 failing**, 129.1 s (`pytest -q`).
- Distribution: retrieval 26, LLM 21, ingestion 19, health/API 10, security 2, streaming 1.
- **No coverage measurement exists.** No `pytest-cov` in requirements; percentage coverage cannot be stated.
- API endpoint coverage: 3 of 13 endpoints are exercised by tests (`/health`, `/chat`, `/upload` preflight). `/retrieve`, `/documents*`, and all four `/auth/*` routes have no route-level test.
- Failure paths that **are** tested: ingestion marks `FAILED` on error; retrieval raises `NoResultsError` when everything is below threshold and when search returns nothing; session tampering is rejected; password hashes are one-way; SSE whitespace is preserved exactly.
- Failure paths with **no test**: malformed/corrupt PDF, oversized upload rejection, unsupported extension rejection, DB unavailable, LLM provider timeout/rate-limit, embedding-service failure.

---

## 6. Security / production

Measurable facts only — no security feature is converted into a percentage.

| Control | Evidence |
|---|---|
| Password hashing | PBKDF2-HMAC-SHA256, 310,000 iterations, 128-bit random salt, `hmac.compare_digest` verification (`app/core/security.py`) |
| Session tokens | HMAC-SHA256 signed, base64url, explicit `exp` check, constant-time compare |
| Session cookie | HttpOnly, Secure (default true), SameSite=None, 30-day max-age |
| Tenant isolation | Every document, chunk, and retrieval query is filtered by `Document.user_id`; enforced in `retrieval_pipeline.py:77` and all `/documents` routes |
| Input validation | Pydantic schemas on all bodies; filter keys rejected against an allow-list (`InvalidFilterError`) |
| Rate limiting | slowapi per-IP: 10/min upload, 30/min chat |
| Security headers | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, Cache-Control |
| DB constraints | Unique index on `users.email`; `ON DELETE CASCADE` from users → documents → chunks |
| Secrets handling | All secrets via env; `.env` gitignored; `.env.example` ships placeholders |
| Docs exposure | `/docs`, `/redoc`, `/openapi.json` disabled unless `DEBUG=true` |
| Container hardening | Dockerfile runs as non-root `appuser` |

**Not implemented:** no RBAC, no prompt-injection defence, no account lockout or
login attempt throttling, no CSRF token (mitigated by SameSite + JSON-only bodies).

---

## 6b. Deployment — verified live

Probed directly against the hosts on 2026-09-20, not read from committed config
(the repo's `.env` points at `localhost`; the real URLs live in the Vercel and
Railway dashboards and were recovered from git history and the deployed JS bundle).

| Target | Result |
|---|---|
| `https://docuqueryvc.vercel.app` | HTTP 200, serves the app (`<title>DocuQuery — Understand your documents with AI</title>`) |
| `https://docuqueryprod.up.railway.app/health` | HTTP 200, `{"status":"ok","app":"DocuQuery","version":"0.1.0","database":"ok"}` |
| `GET /auth/me` with no cookie | HTTP 401 |
| `GET /documents` with no cookie | HTTP 401 |

**"Deployed and publicly accessible" is a defensible resume claim.** Both tiers
respond, the API reports live database connectivity, and protected routes reject
unauthenticated requests rather than leaking data.

Two caveats worth knowing before an interview:
- The first `/health` call took **4.1 s**, consistent with a cold start on
  Railway's free tier. A reviewer clicking the link may wait several seconds.
- Liveness was verified; a full signup → upload → ask → cited-answer round trip
  against production was **not** re-run in this audit.

Commands:
```
curl -s -o /dev/null -w "%{http_code}" -L https://docuqueryvc.vercel.app
curl -s https://docuqueryprod.up.railway.app/health
curl -s -o /dev/null -w "%{http_code}" https://docuqueryprod.up.railway.app/auth/me
```

---

## 7. Defects found during this audit

1. **`.env` names the wrong embedding model.** `EMBEDDING_MODEL=BAAI/bge-base-en-v1.5`,
   but the model actually loaded from `embedding_model_dir` is bge-**small**-en-v1.5.
   The label is only used in logs, so behaviour is correct — but any log-derived
   evidence about which model ran would be wrong.
2. **Migration `a9f3d6c1b5e8` leaves documents unsearchable but still marked indexed.**
   It runs `UPDATE document_chunks SET embedding = NULL` without resetting
   `documents.status`. The live database currently holds 5 documents at
   `status='indexed'` but 31 chunks of which only 30 have an embedding — one
   document is silently unsearchable while the UI reports it as indexed.
3. **README documents 12 endpoints; 13 exist.** `GET /documents/{id}/debug` is undocumented.
4. ~~**CI does not actually gate `main`.**~~ **Partly addressed.** `.github/workflows/ci.yml`
   existed only on the unmerged branch `fix/auth-secret-guard-ci`. An identical copy is now
   on `docs/refresh-dependency-verification`, and the README's fake static
   `build-passing` badge has been replaced with the real GitHub Actions badge.
   Landing the workflow also required cherry-picking `cc718d0` (a
   `react-hooks/set-state-in-effect` error in `useDemoLoop.ts`), without which
   `npm run lint` exits 1 and the frontend job fails.
   All four CI steps verified locally: pytest 79 passed, `tsc --noEmit` 0,
   `npm run lint` 0, `npm run build` 0.
   **Still open:** the workflow must reach `main` before the badge resolves — a
   GitHub Actions badge reads the workflow from the default branch.

---

## 8. Resume bullets that are defensible today

Only these. Every other bullet must wait for the corpus.

> **"Benchmarked ONNX INT8 embedding throughput across batch sizes 1/8/32/64 and
> identified batch 32 as optimal, a 6.17× throughput gain over unbatched inference
> (178.4 s → 28.9 s for 128 passages) and 3.4× over batch 64."**
>
> - What I did: wrote a reproducible benchmark that holds the input fixed and varies only batch size.
> - Measured by: `backend/evaluation/run_perf_bench.py`
> - Evidence: `backend/evaluation/results/perf_bench_smoke.json`
> - Confidence: **HIGH**

> **"Measured end-to-end retrieval latency of a PostgreSQL/pgvector HNSW pipeline at
> P50 11.8 ms and P95 14.1 ms, covering query embedding, ANN search, threshold
> filtering, ranking and citation extraction."**
>
> - What I did: instrumented the production retrieval function and sampled it repeatedly rather than timing one call.
> - Measured by: `backend/evaluation/run_perf_bench.py`
> - Evidence: `results/perf_bench_smoke.json` → `retrieval.latency_ms`
> - Confidence: **HIGH** (n=24; re-run on the real corpus to widen the sample)

> **"Cut the embedding service's memory footprint enough to fit a 512 MB deployment
> tier by replacing PyTorch/sentence-transformers with ONNX Runtime INT8, holding
> the same 384-dimensional bge-small-en-v1.5 vectors."**
>
> - What I did: diagnosed a Railway OOM SIGKILL, rewrote the embedding layer, and migrated the vector column 768 → 384.
> - Evidence: commits `fix: replace PyTorch embedding stack with ONNX Runtime`, `fix: swap embedding model to bge-small to fix Railway OOM crash`; migration `a9f3d6c1b5e8`.
> - Confidence: **MEDIUM** — the *direction* is documented in code and commits, but the before/after MB figures were never captured. To make this HIGH, see experiment 3 below.

> **"Built and maintained a 79-test backend suite covering parsing, chunking,
> retrieval scoring, citation extraction, prompt construction, provider
> abstraction, SSE streaming, password hashing and session validation."**
>
> - Measured by: `cd backend && pytest -q`
> - Evidence: 79 passed in 129.12 s
> - Confidence: **HIGH**
> - Caveat: do not claim a coverage percentage. None has been measured.

---

## 9. The experiments that would most improve this resume

In order of payoff.

1. **Ingest a real multi-page corpus and run the retrieval evaluation.**
   Unlocks Recall@1/3/5, MRR, NDCG@5, Precision@5 and page-level citation accuracy
   — the single highest-value class of metric for a Data & AI application, and the
   only one that demonstrates *evaluation* rather than *engineering*.
   `ingest_corpus.py` → `build_eval_set.py --n 80` → `run_retrieval_eval.py`

2. **Run the chunking sweep.** Produces a genuine before/after improvement claim
   ("Recall@5 X% → Y%, +Z pp") from a controlled experiment on a fixed query set.
   `run_config_sweep.py --corpus <dir>`

3. **Capture the PyTorch → ONNX memory delta.** Measure RSS after loading
   sentence-transformers vs after loading the ONNX session, in the same container.
   Converts the strongest *story* in this project into a hard number.

4. **Measure test coverage.** Add `pytest-cov`, run `pytest --cov=app`. One command,
   turns "79 tests" into "79 tests, N% coverage".

5. **Widen the LLM latency sample.** Current TTFT figures rest on 2 calls. Run
   `run_perf_bench.py --llm --llm-queries 50` once a real query set exists to get
   defensible P50/P95/P99 for time-to-first-token.
