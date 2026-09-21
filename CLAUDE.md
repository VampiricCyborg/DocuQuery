# DocuQuery — working rules

Retrieval-augmented document search. Upload PDFs, DOCX, TXT or Markdown; they are
parsed, chunked, embedded and stored in PostgreSQL with pgvector; questions are
answered from the retrieved passages with citations back to filename and page.

## Layout

```
backend/
  app/
    api/            FastAPI routes. Thin — no business logic here.
    core/           Settings, logging, security primitives, middleware.
    database/       Declarative Base, engine, session, ORM models.
    ingestion/      parse → clean → chunk → embed → store. pipeline.py orchestrates.
    retrieval/      embed query → vector search → score → build context → citations.
    llm/            Providers, prompts, response generator, SSE framing.
    services/       Document persistence used by the routes.
  migrations/       Alembic. versions/ is the revision chain.
  evaluation/       Corpus manifest, eval-set builder, retrieval and perf harnesses.
  scripts/          Operational one-offs (reindex.py).
  tests/            pytest. conftest.py holds the integration fixtures.
frontend/           Next.js 16 App Router, React 19, TanStack Query, Zustand.
```

The API layer stays thin on purpose: routes validate, call into a service or
pipeline, and translate exceptions into status codes. Anything that would be worth
unit-testing belongs a layer down.

## Running things

All backend commands run from `backend/`, and need `AUTH_SECRET` set (see below).

```bash
# Unit tests — mocked database, no services needed. This is the default.
pytest -q

# Integration tests — real PostgreSQL. Skipped entirely when TEST_DATABASE_URL is unset.
docker run -d --name docuquery-test-db -p 5434:5432 \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=docuquery_test pgvector/pgvector:pg16
export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5434/docuquery_test
pytest -q -m integration        # just the integration tier
pytest -q                       # both tiers
pytest -q --cov=app --cov-report=term-missing

# Evaluation — see backend/evaluation/README.md for the full sequence.
python -m evaluation.ingest_corpus
python -m evaluation.build_eval_set --n 100
python -m evaluation.run_retrieval_eval
python -m evaluation.run_perf_bench
```

Use port **5434** for the test database. The project's own dev stack
(`docker compose`) already binds **5433**, and the integration fixtures TRUNCATE
whatever they are pointed at.

`AUTH_SECRET` is mandatory whenever `DEBUG=false`: `Settings` refuses to build with
the committed development default, because that value alone signs every session
cookie. For local work either export a throwaway value or set `DEBUG=true`.

```bash
export AUTH_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
```

## Standing rules

**One PR per phase.** A phase is a numbered body of work with its own branch and its
own PR. Do not fold the next phase's changes into the current PR because they are
small or convenient; they get reviewed in the phase that owns them.

**Every retrieval change includes a before/after table against `BASELINE.md`.**
Any change to chunking, embedding, the similarity threshold, top-k, filtering,
scoring or context building is a retrieval change. Re-run
`run_retrieval_eval.py` on the same query set and put both columns in the PR
description. "It seems better" is not a result, and a retrieval change without a
table is not reviewable.

**Never edit a migration that has already been applied.** Alembic will not re-run a
stamped revision, so an edit leaves every deployed database describing a history it
does not have. Correct a bad migration with a new one. This is not hypothetical
here: `a9f3d6c1b5e8` cleared every embedding without resetting document status, and
the fix was `d5e2c8a7f1b3`, not a patch to the original.

Write a real `downgrade()`, and keep migrations additive where the change allows it.
`backend/railway.json` runs `alembic upgrade head` on **every boot**, so merging a
PR that contains a migration *is* running that migration against production. Review
it on those terms. The same applies to any fail-fast configuration guard: it takes
the API down on the next deploy if the value is not already set in Railway.

**Read `frontend/AGENTS.md` before touching Next.js code.** This is Next.js 16 with
React 19. Framework behaviour has changed in ways that predate most training data —
`params` is a Promise, route-level state preservation and `unstable_instant`
validation depend on `cacheComponents`, which this project does **not** currently
enable. The guides bundled at `frontend/node_modules/next/dist/docs/` are the
authority for this exact version; prefer them over recollection.

**Do not change retrieval behaviour and measure it in the same breath.** A baseline
is only a baseline if it describes code that is actually deployed, bugs included.
