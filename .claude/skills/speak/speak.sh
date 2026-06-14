#!/usr/bin/env bash
# speak.sh — speak the given text out loud via the ElevenLabs API.
# Usage: speak.sh "text to say"
set -euo pipefail

text="$*"
if [[ -z "${text//[[:space:]]/}" ]]; then
  echo "speak.sh: nothing to say (no text provided)" >&2
  exit 1
fi

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "speak.sh: ELEVENLABS_API_KEY is not set" >&2
  exit 1
fi

voice_id="${ELEVENLABS_VOICE_ID:-JBFqnCBsd6RMkjVDRZzb}"
model_id="${ELEVENLABS_MODEL_ID:-eleven_turbo_v2_5}"
out="$(mktemp -t speak.XXXXXX).mp3"

# jq -Rs . safely JSON-escapes arbitrary text (quotes, newlines, etc.).
payload="$(jq -nc --arg t "$text" --arg m "$model_id" \
  '{text: $t, model_id: $m}')"

curl -fsS -X POST \
  "https://api.elevenlabs.io/v1/text-to-speech/${voice_id}" \
  -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  --output "$out"

# Play through whichever audio player is available.
if command -v afplay >/dev/null 2>&1; then
  afplay "$out"
elif command -v ffplay >/dev/null 2>&1; then
  ffplay -nodisp -autoexit -loglevel quiet "$out"
elif command -v mpg123 >/dev/null 2>&1; then
  mpg123 -q "$out"
elif command -v aplay >/dev/null 2>&1; then
  aplay -q "$out"
else
  echo "speak.sh: no audio player found (tried afplay, ffplay, mpg123, aplay)" >&2
  echo "speak.sh: audio saved to $out" >&2
  exit 1
fi

rm -f "$out"
