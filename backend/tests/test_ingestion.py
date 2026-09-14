"""
Phase 3 ingestion unit tests.
All tests are pure — no database, no network, no model loading.
"""

import pytest
import tempfile
import os
from unittest.mock import patch, MagicMock, AsyncMock

from app.ingestion.cleaner import clean_text, clean_pages
from app.ingestion.parser import ParsedPage, _parse_txt, _parse_md
from app.ingestion.chunker import chunk_pages, _extract_section
from app.ingestion.metadata import extract_document_metadata


# ---------------------------------------------------------------------------
# cleaner
# ---------------------------------------------------------------------------

class TestCleaner:
    def test_collapses_extra_whitespace(self):
        assert clean_text("hello   world") == "hello world"

    def test_normalizes_windows_newlines(self):
        assert "\r" not in clean_text("line1\r\nline2")

    def test_max_one_blank_line(self):
        result = clean_text("a\n\n\n\n\nb")
        assert "\n\n\n" not in result

    def test_strips_form_feed(self):
        assert "\x0c" not in clean_text("page1\x0cpage2")

    def test_preserves_paragraph_break(self):
        result = clean_text("para one\n\npara two")
        assert "\n\n" in result

    def test_clean_pages_returns_new_list(self):
        pages = [ParsedPage(page_number=1, text="  hello   world  ")]
        cleaned = clean_pages(pages)
        assert cleaned[0].text == "hello world"
        assert cleaned is not pages


# ---------------------------------------------------------------------------
# parser (txt + md — no binary deps needed)
# ---------------------------------------------------------------------------

class TestParser:
    def test_parse_txt(self, tmp_path):
        f = tmp_path / "sample.txt"
        f.write_text("Hello world\nSecond line", encoding="utf-8")
        pages = _parse_txt(f)
        assert len(pages) == 1
        assert "Hello world" in pages[0].text

    def test_parse_txt_empty_returns_empty(self, tmp_path):
        f = tmp_path / "empty.txt"
        f.write_text("   \n  ", encoding="utf-8")
        assert _parse_txt(f) == []

    def test_parse_md_preserves_heading(self, tmp_path):
        f = tmp_path / "doc.md"
        f.write_text("# Introduction\n\nSome content here.", encoding="utf-8")
        pages = _parse_md(f)
        assert pages[0].metadata.get("format") == "markdown"
        assert "# Introduction" in pages[0].text

    def test_parse_unsupported_raises(self):
        from app.ingestion.parser import parse_document
        with pytest.raises(ValueError, match="Unsupported"):
            parse_document("file.xyz")


# ---------------------------------------------------------------------------
# chunker
# ---------------------------------------------------------------------------

class TestChunker:
    def _make_pages(self, text: str) -> list[ParsedPage]:
        return [ParsedPage(page_number=1, text=text)]

    def test_produces_chunks(self):
        pages = self._make_pages("word " * 500)
        chunks = chunk_pages(pages, document_id="doc1", filename="test.txt")
        assert len(chunks) > 1

    def test_chunk_metadata_populated(self):
        pages = self._make_pages("word " * 200)
        chunks = chunk_pages(pages, document_id="doc-abc", filename="file.txt")
        assert chunks[0].document_id == "doc-abc"
        assert chunks[0].filename == "file.txt"
        assert chunks[0].page_number == 1
        assert chunks[0].chunk_index == 0

    def test_chunk_indices_sequential(self):
        pages = self._make_pages("word " * 500)
        chunks = chunk_pages(pages, document_id="d1", filename="f.txt")
        indices = [c.chunk_index for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_extract_section_markdown(self):
        assert _extract_section("## Methods\n\nSome text") == "Methods"

    def test_extract_section_allcaps(self):
        assert _extract_section("INTRODUCTION\n\nSome text") == "INTRODUCTION"

    def test_extract_section_none(self):
        assert _extract_section("just regular text here") == ""


# ---------------------------------------------------------------------------
# metadata
# ---------------------------------------------------------------------------

class TestMetadata:
    def test_extract_metadata(self):
        pages = [
            ParsedPage(page_number=1, text="hello world"),
            ParsedPage(page_number=2, text="foo bar"),
        ]
        meta = extract_document_metadata(pages, "report.pdf")
        assert meta["page_count"] == 2
        assert meta["filename"] == "report.pdf"
        assert meta["total_chars"] > 0


# ---------------------------------------------------------------------------
# pipeline (mocked — no DB, no embeddings)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pipeline_success():
    pages = [ParsedPage(page_number=1, text="word " * 300)]
    mock_db = AsyncMock()

    with patch("app.ingestion.pipeline.parse_document", return_value=pages), \
         patch("app.ingestion.pipeline.clean_pages", return_value=pages), \
         patch("app.ingestion.pipeline.chunk_pages") as mock_chunk, \
         patch("app.ingestion.pipeline.get_embedding_service") as mock_emb_svc, \
         patch("app.ingestion.pipeline.store_chunks", new_callable=AsyncMock), \
         patch("app.ingestion.pipeline.update_document_status", new_callable=AsyncMock):

        from app.ingestion.chunker import TextChunk
        fake_chunks = [TextChunk(text="chunk", chunk_index=0, page_number=1, document_id="d1", filename="f.txt")]
        mock_chunk.return_value = fake_chunks

        mock_emb = MagicMock()
        mock_emb.embed.return_value = [[0.1] * 384]
        mock_emb_svc.return_value = mock_emb

        from app.ingestion.pipeline import run_ingestion_pipeline
        await run_ingestion_pipeline("d1", "/fake/path.txt", "f.txt", mock_db)

        mock_emb.embed.assert_called_once()


@pytest.mark.asyncio
async def test_pipeline_marks_failed_on_error():
    mock_db = AsyncMock()

    with patch("app.ingestion.pipeline.parse_document", side_effect=RuntimeError("corrupt")), \
         patch("app.ingestion.pipeline.update_document_status", new_callable=AsyncMock) as mock_status:

        from app.ingestion.pipeline import run_ingestion_pipeline
        from app.database.models import ProcessingStatus

        # Pipeline must NOT re-raise — background tasks swallow errors cleanly
        await run_ingestion_pipeline("d1", "/bad/path.pdf", "bad.pdf", mock_db)

        # Last status call must be FAILED
        last_call_status = mock_status.call_args_list[-1].args[1]
        assert last_call_status == ProcessingStatus.failed
