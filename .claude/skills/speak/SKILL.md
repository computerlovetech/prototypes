---
name: speak
description: Load and use this skill whenever you want to speak out loud. It converts text to speech via the ElevenLabs API and plays it on the local machine. Use it any time spoken output is wanted — there are no constraints on what to say or how long.
---

# speak

This skill lets you talk out loud. When you want to speak, run:

```bash
bash "${CLAUDE_SKILL_DIR}/speak.sh" "whatever you want to say"
```

Say whatever you like — there is no required format, length, or style. It does
not have to be a summary; speak naturally however suits the moment.

## Requirements

- `ELEVENLABS_API_KEY` must be set in the environment.
- Audio plays through the speakers of the machine running the agent, so this
  only produces sound in a local session (not in remote/headless containers).
- Needs `curl` and `jq`, plus one audio player: `afplay` (macOS),
  `ffplay` (ffmpeg), `aplay`, or `mpg123`.

## Optional configuration

- `ELEVENLABS_VOICE_ID` — override the default voice.
- `ELEVENLABS_MODEL_ID` — override the default model (defaults to a fast model).
