import { existsSync } from "node:fs";
import { delimiter } from "node:path";

export interface VoiceConfig {
  apiKey: string | undefined;
  voiceId: string;
  ttsModelId: string;
  sttModelId: string;
  languageCode: string | undefined;
  shortcut: string;
  continuousShortcut: string;
  recordSeconds: number;
  ttsMode: "off" | "final" | "stream";
  ffmpegInput: string;
  playerCommand: string;
  maxSentenceChars: number;
}

export function loadConfig(): VoiceConfig {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? "cjVigY5qzO86Huf0OWal",
    ttsModelId: process.env.ELEVENLABS_TTS_MODEL_ID ?? "eleven_multilingual_v2",
    sttModelId: process.env.ELEVENLABS_STT_MODEL_ID ?? "scribe_v2",
    languageCode: process.env.ELEVENLABS_LANGUAGE || undefined,
    shortcut: process.env.PI_VOICE_SHORTCUT ?? "ctrl+alt+v",
    continuousShortcut: process.env.PI_VOICE_CONTINUOUS_SHORTCUT ?? "ctrl+alt+c",
    recordSeconds: readNumber("PI_VOICE_RECORD_SECONDS", 8),
    ttsMode: readTtsMode(process.env.PI_VOICE_TTS_MODE),
    ffmpegInput: process.env.PI_VOICE_FFMPEG_INPUT ?? ":0",
    playerCommand: process.env.PI_VOICE_PLAYER ?? "afplay",
    maxSentenceChars: readNumber("PI_VOICE_MAX_SENTENCE_CHARS", 260)
  };
}

export function findExecutable(name: string): string | undefined {
  const paths = (process.env.PATH ?? "").split(delimiter);
  for (const dir of paths) {
    const candidate = `${dir}/${name}`;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readTtsMode(value: string | undefined): VoiceConfig["ttsMode"] {
  if (value === "off" || value === "stream" || value === "final") return value;
  return "final";
}
