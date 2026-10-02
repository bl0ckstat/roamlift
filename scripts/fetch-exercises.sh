#!/usr/bin/env bash
# Download the free-exercise-db dataset (exercise metadata + demo images)
# into data/. Safe to re-run; replaces any previous download.
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading free-exercise-db (~100 MB)..."
curl -fL -o "$tmp/fedb.tar.gz" \
  https://github.com/yuhonas/free-exercise-db/archive/refs/heads/main.tar.gz
tar xzf "$tmp/fedb.tar.gz" -C "$tmp"

mkdir -p data
rm -rf data/exercise-images
cp "$tmp"/free-exercise-db-main/dist/exercises.json data/
cp -r "$tmp"/free-exercise-db-main/exercises data/exercise-images
cp "$tmp"/free-exercise-db-main/LICENSE.md data/EXERCISE-DB-LICENSE.md

echo "Done: $(python3 -c "import json;print(len(json.load(open('data/exercises.json'))))") exercises in data/"
