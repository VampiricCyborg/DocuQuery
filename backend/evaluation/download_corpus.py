"""
Fetch the evaluation corpus described by corpus/manifest.json.

The PDFs are not in the repository -- they are large, and they belong to their
publishers rather than to this project. The manifest is what is version
controlled: a URL, a SHA-256 and a license note for every document, so that the
corpus one person measures against is byte-for-byte the corpus another person
gets.

    python -m evaluation.download_corpus                 # fetch + verify
    python -m evaluation.download_corpus --verify-only   # check what is on disk
    python -m evaluation.download_corpus --write-hashes  # record hashes (maintainers)

`--write-hashes` is how a new document gets into the manifest: add the entry with
`"sha256": null`, run it once, commit the hash it fills in. It refuses to
overwrite a hash that is already recorded, so it cannot silently bless a document
that changed upstream -- that shows up as a verification failure instead, which
is the whole point of recording the hash.

A file that fails verification is left on disk with a .corrupt suffix rather than
deleted, so it can be looked at.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

CORPUS_DIR = Path(__file__).resolve().parent / "corpus"
MANIFEST_PATH = CORPUS_DIR / "manifest.json"
FILES_DIR = CORPUS_DIR / "files"

# Several of these publishers reject requests without a descriptive User-Agent.
# NIST and GAO both do; an unset agent gets a 403.
USER_AGENT = "DocuQuery-Eval/0.1 (retrieval evaluation corpus; +https://github.com/VampiricCyborg/DocuQuery)"

_CHUNK = 1 << 16


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(_CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def _describe_pdf(path: Path) -> tuple[int | None, str | None]:
    """Page count and embedded title, read from the file itself."""
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - pymupdf is a project dependency
        return None, None
    try:
        with pymupdf.open(path) as document:
            title = (document.metadata or {}).get("title") or None
            return document.page_count, (title.strip() or None) if title else None
    except Exception as exc:  # a corrupt download should not crash the run
        print(f"  (could not read {path.name}: {exc})")
        return None, None


def load_manifest() -> dict:
    if not MANIFEST_PATH.is_file():
        raise SystemExit(f"No manifest at {MANIFEST_PATH}")
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    tmp = destination.with_suffix(destination.suffix + ".part")
    with urllib.request.urlopen(request, timeout=120) as response, tmp.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    tmp.replace(destination)


def process(entry: dict, *, verify_only: bool, write_hashes: bool) -> str:
    """Returns one of: ok, downloaded, hashed, mismatch, missing, error."""
    destination = FILES_DIR / entry["filename"]
    expected = entry.get("sha256")

    if not destination.is_file():
        if verify_only:
            print(f"  MISSING    {entry['filename']}")
            return "missing"
        try:
            print(f"  fetching   {entry['filename']} ...", flush=True)
            download(entry["url"], destination)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            print(f"  ERROR      {entry['filename']}: {exc}")
            return "error"
        outcome = "downloaded"
    else:
        outcome = "ok"

    actual = sha256_of(destination)

    if expected is None:
        if write_hashes:
            entry["sha256"] = actual
            entry["bytes"] = destination.stat().st_size
            pages, title = _describe_pdf(destination)
            entry["pages"] = pages
            # Recorded from the file rather than typed by hand, so the manifest
            # cannot drift from what the corpus actually contains.
            if title and not entry.get("title"):
                entry["title"] = title
            print(f"  RECORDED   {entry['filename']}  {actual[:16]}...  {pages}p")
            return "hashed"
        print(f"  NO HASH    {entry['filename']} — run with --write-hashes")
        return "error"

    if actual != expected:
        corrupt = destination.with_suffix(destination.suffix + ".corrupt")
        destination.replace(corrupt)
        print(
            f"  MISMATCH   {entry['filename']}\n"
            f"             expected {expected}\n"
            f"             actual   {actual}\n"
            f"             moved to {corrupt.name}"
        )
        return "mismatch"

    print(f"  {'fetched' if outcome == 'downloaded' else 'verified':<10} {entry['filename']}")
    return outcome


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Check the files already on disk; download nothing.",
    )
    parser.add_argument(
        "--write-hashes",
        action="store_true",
        help="Fill in manifest entries whose sha256 is null. Never overwrites one.",
    )
    args = parser.parse_args()

    manifest = load_manifest()
    documents = manifest["documents"]
    FILES_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[corpus] {len(documents)} document(s) in {MANIFEST_PATH.name}\n")

    counts: dict[str, int] = {}
    for entry in documents:
        outcome = process(entry, verify_only=args.verify_only, write_hashes=args.write_hashes)
        counts[outcome] = counts.get(outcome, 0) + 1

    if args.write_hashes and counts.get("hashed"):
        MANIFEST_PATH.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"\n[corpus] wrote {counts['hashed']} hash(es) to {MANIFEST_PATH.name}")

    print("\n[corpus] " + ", ".join(f"{count} {name}" for name, count in sorted(counts.items())))
    print(f"[corpus] files in {FILES_DIR}")

    failed = counts.get("mismatch", 0) + counts.get("error", 0) + counts.get("missing", 0)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
