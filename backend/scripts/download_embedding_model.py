"""
Download the pinned ONNX embedding model + tokenizer assets.

Deliberately stdlib-only (urllib) so this script needs nothing from
requirements.txt to run -- it's used both at Docker build time and for
local dev setup, before any dependencies are necessarily installed.

Pinned to an exact commit on the Xenova/bge-small-en-v1.5 mirror (a
community ONNX export of BAAI/bge-small-en-v1.5) so the artifact is
reproducible -- never resolves against a moving "main"/"latest" ref.
"""

import sys
import urllib.request
from pathlib import Path

REPO = "Xenova/bge-small-en-v1.5"
COMMIT = "ea104dacec62c0de699686887e3f920caeb4f3e3"
BASE_URL = f"https://huggingface.co/{REPO}/resolve/{COMMIT}"

FILES = {
    "onnx/model_quantized.onnx": "model.onnx",
    "tokenizer.json": "tokenizer.json",
    "tokenizer_config.json": "tokenizer_config.json",
    "vocab.txt": "vocab.txt",
    "special_tokens_map.json": "special_tokens_map.json",
    "config.json": "config.json",
}

DEFAULT_DEST = Path(__file__).resolve().parent.parent / "models" / "bge-small-en-v1.5-onnx-int8"


def download(dest_dir: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    for remote_path, local_name in FILES.items():
        dest = dest_dir / local_name
        if dest.exists() and dest.stat().st_size > 0:
            print(f"[download_embedding_model] skip (exists): {local_name}")
            continue
        url = f"{BASE_URL}/{remote_path}"
        print(f"[download_embedding_model] fetching {url} -> {dest}")
        urllib.request.urlretrieve(url, dest)
    print(f"[download_embedding_model] done. Assets in {dest_dir}")


if __name__ == "__main__":
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DEST
    download(dest)
