#!/bin/sh
# Starts Mika's local voice server on http://127.0.0.1:8000.
# Needs uv (brew install uv) and ffmpeg (brew install ffmpeg). The first run downloads
# Python packages and models (~2 GB), so it takes a few minutes; later runs are quick.
cd "$(dirname "$0")" && exec uv run --python 3.12 server.py
