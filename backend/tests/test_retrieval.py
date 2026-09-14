"""
Phase 4 retrieval unit tests.
All tests are pure — no database, no network, no model loading.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.retrieval.scoring import (
    cosine_distance_to_similarity,
    apply_threshold,
    deduplicate,
    rank,
    normalize_scores,
)
from app.retrieval.citations import extract_citation, extract_citations
from app.retrieval.context_builder import build_context
from app.retrieval.filters import RetrievalFilter, build_where_clauses
from app.retrieval.exceptions import NoResultsError, EmbeddingError, InvalidFilterError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chunk(
    chunk_id: str = "c1",
    doc_id: str = "d1",
    filename: str = "test.pdf",
    page: int = 1,
    chunk_index: int = 0,
    text: str = "Sample text.",
):
    chunk = MagicMock()
    chunk.id = chunk_id
    chunk.document_id = doc_id
    chunk.page_number = page
    chunk.chunk_index = chunk_index
    chunk.text = text
    chunk.metadata_ = {"filename": filename}
    return chunk


# ---------------------------------------------------------------------------
# scoring
# ---------------------------------------------------------------------------

class TestScoring:
    def test_distance_zero_is_similarity_one(self):
        assert cosine_distance_to_similarity(0.0) == 1.0

    def test_distance_two_is_similarity_zero(self):
        assert cosine_distance_to_similarity(2.0) == 0.0

    def test_distance_one_is_similarity_half(self):
        assert cosine_distance_to_similarity(1.0) == 0.5

    def test_clamps_below_zero(self):
        assert cosine_distance_to_similarity(3.0) == 0.0

    def test_apply_threshold_filters_low_scores(self):
        chunk = _make_chunk()
        result = apply_threshold([(chunk, 0.2), (chunk, 0.8)], threshold=0.5)
        assert len(result) == 1
        assert result[0][1] == 0.8

    def test_apply_threshold_keeps_equal(self):
        chunk = _make_chunk()
        result = apply_threshold([(chunk, 0.5)], threshold=0.5)
        assert len(result) == 1

    def test_deduplicate_removes_same_id(self):
        c = _make_chunk(chunk_id="same")
        result = deduplicate([(c, 0.9), (c, 0.7)])
        assert len(result) == 1
        assert result[0][1] == 0.9

    def test_rank_sorts_descending_and_caps(self):
        c1 = _make_chunk(chunk_id="a")
        c2 = _make_chunk(chunk_id="b")
        c3 = _make_chunk(chunk_id="c")
        result = rank([(c1, 0.5), (c2, 0.9), (c3, 0.7)], max_chunks=2)
        assert result[0][1] == 0.9
        assert result[1][1] == 0.7
        assert len(result) == 2

    def test_normalize_scores_full_pipeline(self):
        c1 = _make_chunk(chunk_id="x")
        c2 = _make_chunk(chunk_id="y")
        # distances: 0.2 → sim 0.9, 1.5 → sim 0.25 (below threshold 0.3)
        raw = [(c1, 0.2), (c2, 1.5)]
        result = normalize_scores(raw, threshold=0.3, max_chunks=5)
        assert len(result) == 1
        assert result[0][0].id == "x"


# ---------------------------------------------------------------------------
# citations
# ---------------------------------------------------------------------------

class TestCitations:
    def test_extract_citation_fields(self):
        chunk = _make_chunk(doc_id="doc-1", filename="hr.pdf", page=5, chunk_index=3)
        citation = extract_citation(chunk)
        assert citation.document_id == "doc-1"
        assert citation.filename == "hr.pdf"
        assert citation.page == 5
        assert citation.chunk_index == 3

    def test_extract_citations_list(self):
        chunks = [_make_chunk(chunk_id=str(i)) for i in range(3)]
        citations = extract_citations(chunks)
        assert len(citations) == 3

    def test_citation_is_hashable(self):
        chunk = _make_chunk()
        citation = extract_citation(chunk)
        assert hash(citation) is not None


# ---------------------------------------------------------------------------
# context_builder
# ---------------------------------------------------------------------------

class TestContextBuilder:
    def test_empty_chunks_returns_empty_string(self):
        assert build_context([]) == ""

    def test_single_chunk_contains_filename_and_text(self):
        chunk = _make_chunk(filename="policy.pdf", page=3, text="Leave policy details.")
        ctx = build_context([chunk])
        assert "policy.pdf" in ctx
        assert "Leave policy details." in ctx
        assert "Page: 3" in ctx

    def test_multiple_chunks_all_present(self):
        chunks = [
            _make_chunk(chunk_id="a", filename="a.pdf", text="Alpha content."),
            _make_chunk(chunk_id="b", filename="b.pdf", text="Beta content."),
        ]
        ctx = build_context(chunks)
        assert "Alpha content." in ctx
        assert "Beta content." in ctx

    def test_max_chars_truncates(self):
        chunk = _make_chunk(text="x" * 5000)
        chunks = [_make_chunk(chunk_id=str(i), text="x" * 5000) for i in range(5)]
        ctx = build_context(chunks, max_chars=6000)
        # Should not contain all 5 chunks worth of text
        assert len(ctx) < 5 * 5000


# ---------------------------------------------------------------------------
# filters
# ---------------------------------------------------------------------------

class TestFilters:
    def test_none_filters_returns_empty_clauses(self):
        assert build_where_clauses(None) == []

    def test_document_id_filter(self):
        f = RetrievalFilter(document_id="abc-123")
        clauses = build_where_clauses(f)
        assert len(clauses) == 1

    def test_multiple_filters_produce_multiple_clauses(self):
        f = RetrievalFilter(filename="handbook.pdf", file_type="pdf")
        clauses = build_where_clauses(f)
        assert len(clauses) == 2

    def test_unknown_filter_key_raises(self):
        with pytest.raises(Exception):
            RetrievalFilter(**{"nonexistent_field": "value"})

    def test_empty_filter_produces_no_clauses(self):
        f = RetrievalFilter()
        assert build_where_clauses(f) == []


# ---------------------------------------------------------------------------
# embedding_query
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_embed_query_returns_vector():
    mock_service = MagicMock()
    mock_service.embed.return_value = [[0.1] * 384]

    with patch("app.retrieval.embedding_query.get_embedding_service", return_value=mock_service):
        from app.retrieval.embedding_query import embed_query
        vector = await embed_query("What is the leave policy?")
        assert len(vector) == 384
        mock_service.embed.assert_called_once()


@pytest.mark.asyncio
async def test_embed_query_raises_on_empty():
    from app.retrieval.embedding_query import embed_query
    with pytest.raises(EmbeddingError):
        await embed_query("   ")


# ---------------------------------------------------------------------------
# retrieval_pipeline (mocked — no DB, no embeddings)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pipeline_returns_result():
    mock_db = AsyncMock()
    chunk = _make_chunk(chunk_id="c1", text="Leave policy is 20 days.")

    with patch("app.retrieval.retrieval_pipeline.embed_query", new_callable=AsyncMock) as mock_embed, \
         patch("app.retrieval.retrieval_pipeline.similarity_search", new_callable=AsyncMock) as mock_search, \
         patch("app.retrieval.retrieval_pipeline.get_settings") as mock_settings:

        mock_embed.return_value = [0.1] * 384
        mock_search.return_value = [(chunk, 0.15)]  # distance 0.15 → similarity 0.925

        settings = MagicMock()
        settings.retrieval_top_k = 5
        settings.retrieval_similarity_threshold = 0.3
        settings.retrieval_max_context_chunks = 10
        mock_settings.return_value = settings

        from app.retrieval.retrieval_pipeline import run_retrieval_pipeline
        result = await run_retrieval_pipeline("What is the leave policy?", mock_db, "test-user")

        assert len(result.chunks) == 1
        assert result.chunks[0].similarity > 0.9
        assert "Leave policy" in result.context
        assert len(result.citations) == 1


@pytest.mark.asyncio
async def test_pipeline_raises_no_results_when_all_below_threshold():
    mock_db = AsyncMock()
    chunk = _make_chunk()

    with patch("app.retrieval.retrieval_pipeline.embed_query", new_callable=AsyncMock) as mock_embed, \
         patch("app.retrieval.retrieval_pipeline.similarity_search", new_callable=AsyncMock) as mock_search, \
         patch("app.retrieval.retrieval_pipeline.get_settings") as mock_settings:

        mock_embed.return_value = [0.1] * 384
        mock_search.return_value = [(chunk, 1.8)]  # distance 1.8 → similarity 0.1 (below 0.3)

        settings = MagicMock()
        settings.retrieval_top_k = 5
        settings.retrieval_similarity_threshold = 0.3
        settings.retrieval_max_context_chunks = 10
        mock_settings.return_value = settings

        from app.retrieval.retrieval_pipeline import run_retrieval_pipeline
        with pytest.raises(NoResultsError):
            await run_retrieval_pipeline("obscure query", mock_db, "test-user")


@pytest.mark.asyncio
async def test_pipeline_no_results_when_search_empty():
    mock_db = AsyncMock()

    with patch("app.retrieval.retrieval_pipeline.embed_query", new_callable=AsyncMock) as mock_embed, \
         patch("app.retrieval.retrieval_pipeline.similarity_search", new_callable=AsyncMock) as mock_search, \
         patch("app.retrieval.retrieval_pipeline.get_settings") as mock_settings:

        mock_embed.return_value = [0.1] * 384
        mock_search.return_value = []

        settings = MagicMock()
        settings.retrieval_top_k = 5
        settings.retrieval_similarity_threshold = 0.3
        settings.retrieval_max_context_chunks = 10
        mock_settings.return_value = settings

        from app.retrieval.retrieval_pipeline import run_retrieval_pipeline
        with pytest.raises(NoResultsError):
            await run_retrieval_pipeline("empty corpus query", mock_db, "test-user")
