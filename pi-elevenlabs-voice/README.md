# pi-elevenlabs-voice

ElevenLabs voice input and output for [Pi](https://pi.dev/).

This is a native Pi extension. It speaks Pi's assistant replies through ElevenLabs TTS and lets you record a voice message that is transcribed by ElevenLabs STT and sent back into Pi.

## Current experience

- Pi speaks assistant replies aloud.
- `/voice record` records a short utterance, transcribes it, and sends it to Pi.
- `ctrl+alt+v` does the same in the terminal UI.
- `/voice interrupt` stops playback and aborts the current Pi turn.
- `/voice test` verifies TTS playback.

The first version records fixed-duration utterances. True hold-to-talk and continuous realtime VAD are the next step.

## Requirements

- Pi CLI installed and working.
- Node 22+.
- `ffmpeg` available on `PATH`.
- macOS: `afplay` is used by default for playback.
- An ElevenLabs API key.

On macOS:

```sh
brew install ffmpeg
export ELEVENLABS_API_KEY=...
```

## Run locally

From this directory:

```sh
npm install
npm run typecheck
pi -e ./src/index.ts
```

Then inside Pi:

```text
/voice status
/voice test
/voice record
```

Or press:

```text
ctrl+alt+v
```

After the status says `Listening...`, speak. By default the extension records 8 seconds, transcribes the audio, and sends the transcript to Pi as:

```text
<voice>your transcript</voice>
```

## Install into Pi

During development, install from the local folder:

```sh
pi install /Users/kasperjunge/Code/prototypes/pi-elevenlabs-voice
```

Then start Pi normally:

```sh
pi
```

## Configuration

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | required | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | `cjVigY5qzO86Huf0OWal` | Voice used for TTS |
| `ELEVENLABS_TTS_MODEL_ID` | `eleven_multilingual_v2` | TTS model |
| `ELEVENLABS_STT_MODEL_ID` | `scribe_v2` | STT model |
| `ELEVENLABS_LANGUAGE` | auto | Optional language code |
| `PI_VOICE_SHORTCUT` | `ctrl+alt+v` | Pi terminal shortcut |
| `PI_VOICE_RECORD_SECONDS` | `8` | Recording length per utterance |
| `PI_VOICE_TTS_MODE` | `final` | `final`, `stream`, or `off` |
| `PI_VOICE_FFMPEG_INPUT` | `:0` | macOS ffmpeg avfoundation input |
| `PI_VOICE_PLAYER` | `afplay` | Audio playback command |

To list macOS audio capture devices:

```sh
ffmpeg -f avfoundation -list_devices true -i ""
```

Then set a different input, for example:

```sh
export PI_VOICE_FFMPEG_INPUT=":1"
```

## User journey

1. Install Pi and verify `pi` starts.
2. Install this extension with `pi install /Users/kasperjunge/Code/prototypes/pi-elevenlabs-voice`.
3. Export `ELEVENLABS_API_KEY`.
4. Start `pi`.
5. Run `/voice test`.
6. Press `ctrl+alt+v`, speak a command like "read the repo and explain where startup happens", and wait for Pi to answer out loud.

## Notes

Pi's extension API gives this extension direct access to assistant message events and `pi.sendUserMessage()`, so it does not need to proxy Pi's stdin/stdout. That is the main architectural difference from the Claude Code wrapper this was inspired by.
