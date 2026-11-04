#!/bin/sh
# Downloads the open-weights GGUF files this capstone serves into ./models and checks their SHA-256.
# URLs are pinned to a Hugging Face commit, so the bytes cannot change under you.
#   chat model       Qwen2.5-0.5B-Instruct, Q4_K_M  (491,400,032 bytes, Apache-2.0)
#   embedding model  bge-small-en-v1.5, Q8_0        (36,806,944 bytes, MIT; 384-dimensional vectors)
set -eu
cd "$(dirname "$0")/.."
mkdir -p models

fetch() {
  name="$1"; url="$2"; sha="$3"
  if [ -f "models/$name" ] && echo "$sha  models/$name" | sha256sum -c - >/dev/null 2>&1; then
    echo "ok       $name (already downloaded)"
    return
  fi
  echo "download $name"
  curl -fL --retry 3 -o "models/$name.part" "$url"
  echo "$sha  models/$name.part" | sha256sum -c - >/dev/null || { echo "checksum mismatch for $name" >&2; exit 1; }
  mv "models/$name.part" "models/$name"
  echo "ok       $name"
}

# macOS has shasum, not sha256sum.
if ! command -v sha256sum >/dev/null 2>&1; then sha256sum() { shasum -a 256 "$@"; }; fi

fetch qwen2.5-0.5b-instruct-q4_k_m.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf" \
  74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db

fetch bge-small-en-v1.5-q8_0.gguf \
  "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/d32f8c040ea3b516330eeb75b72bcc2d3a780ab7/bge-small-en-v1.5-q8_0.gguf" \
  ec38e8da142596baa913124ae50550de284b6916bf59577ef2f0cb9660c2f514
