---
name: speak
description: Load and use this skill whenever you want to speak out loud. It converts text to speech via the ElevenLabs API and plays it on the local machine. Use it any time spoken output is wanted — there are no constraints on what to say or how long.
---

# speak

This skill lets you talk out loud. When you want to speak, run:

```bash
bash "${CLAUDE_SKILL_DIR}/speak.sh" "the text to say"
```

There is no limit on length or topic — speak as much or as little as fits the
moment. But *how* you write the spoken text matters: see below.

## Speak what you write

By default, the text you speak is the same as the answer you give. Do not write
a normal answer and then a separate spoken "summary" — they are one and the
same. The exception is content that only makes sense on screen (code blocks,
file paths, commands, tables, URLs): keep those in the written answer, but in
the spoken text describe them in words instead of reading the symbols aloud.
So text and speech are identical except where the screen-only parts live.

## Write for the ear, not the eye

Spoken text is a different register from a typical written answer. It is heard
once, in order, with no scrollback — so write it to be listened to:

- Short, plain sentences. One idea at a time.
- No markdown, headings, bullets, or numbered lists. Don't say "bullet one."
- Use contractions and a natural, conversational voice.
- Avoid reading out code, paths, flags, or symbols character by character.
  Say "I updated the speak script" — not "I edited dot-slash speak dot s h".
- Don't front-load with "Here are five things." Just talk.

This is deliberately *not* the dense, structured info-dump style of a normal
written reply. If you wouldn't say it out loud to a person, don't speak it.

## Requirements

- `ELEVENLABS_API_KEY` must be set in the environment.
- Audio plays through the speakers of the machine running the agent, so this
  only produces sound in a local session (not in remote/headless containers).
- Needs `curl` and `jq`, plus one audio player: `afplay` (macOS),
  `ffplay` (ffmpeg), `aplay`, or `mpg123`.

## Optional configuration

- `ELEVENLABS_VOICE_ID` — override the default voice.
- `ELEVENLABS_MODEL_ID` — override the default model (defaults to a fast model).
