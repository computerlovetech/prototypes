import { spawn, type ChildProcess } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VoiceConfig } from "./config.ts";

export class VoiceRecorder {
  private active:
    | {
        dir: string;
        audioFile: string;
        process: ChildProcess;
        done: Promise<void>;
      }
    | undefined;

  constructor(private readonly config: VoiceConfig) {}

  get isRecording(): boolean {
    return this.active !== undefined;
  }

  async recordAndTranscribe(): Promise<string> {
    if (this.active) {
      throw new Error("Voice recorder is already listening");
    }
    if (!this.config.apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not set");
    }

    const dir = await mkdtemp(join(tmpdir(), "pi-voice-recording-"));
    const audioFile = join(dir, "utterance.wav");

    try {
      await this.record(audioFile);
      return await this.transcribe(audioFile);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async start(): Promise<void> {
    if (this.active) return;
    if (!this.config.apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not set");
    }

    const dir = await mkdtemp(join(tmpdir(), "pi-voice-recording-"));
    const audioFile = join(dir, "utterance.wav");
    const { child, done } = this.spawnRecorder(audioFile, false);
    this.active = { dir, audioFile, process: child, done };
  }

  async stopAndTranscribe(): Promise<string> {
    const active = this.active;
    if (!active) {
      throw new Error("Voice recorder is not listening");
    }

    this.active = undefined;
    if (!active.process.killed) {
      active.process.kill("SIGINT");
    }

    try {
      await active.done;
      return await this.transcribe(active.audioFile);
    } finally {
      await rm(active.dir, { recursive: true, force: true });
    }
  }

  private async record(audioFile: string): Promise<void> {
    const { done } = this.spawnRecorder(audioFile, true);
    await done;
  }

  private spawnRecorder(audioFile: string, timed: boolean): { child: ChildProcess; done: Promise<void> } {
    const args = process.platform === "darwin"
      ? [
          "-y",
          "-f",
          "avfoundation",
          "-i",
          this.config.ffmpegInput,
          "-ac",
          "1",
          "-ar",
          "16000",
          audioFile
        ]
      : [
          "-y",
          "-f",
          "alsa",
          "-i",
          "default",
          "-ac",
          "1",
          "-ar",
          "16000",
          audioFile
        ];

    if (timed) {
      const outputIndex = args.length - 1;
      args.splice(outputIndex, 0, "-t", String(this.config.recordSeconds));
    }

    const child = spawn("ffmpeg", args, { stdio: "ignore" });
    const done = waitForRecorder(child);
    return { child, done };
  }

  private async transcribe(audioFile: string): Promise<string> {
    const audio = await readFile(audioFile);
    const form = new FormData();
    form.append("model_id", this.config.sttModelId);
    if (this.config.languageCode) {
      form.append("language_code", this.config.languageCode);
    }
    form.append("file", new Blob([audio], { type: "audio/wav" }), "utterance.wav");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": this.config.apiKey ?? ""
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs STT failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as { text?: string };
    const text = data.text?.trim();
    if (!text) throw new Error("ElevenLabs returned an empty transcript");
    return text;
  }
}

async function waitForRecorder(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") resolve();
      else reject(new Error(`ffmpeg exited with ${code ?? signal}`));
    });
  });
}
