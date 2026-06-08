import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VoiceConfig } from "./config.ts";

export class VoiceRecorder {
  constructor(private readonly config: VoiceConfig) {}

  async recordAndTranscribe(): Promise<string> {
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

  private async record(audioFile: string): Promise<void> {
    const args = process.platform === "darwin"
      ? [
          "-y",
          "-f",
          "avfoundation",
          "-i",
          this.config.ffmpegInput,
          "-t",
          String(this.config.recordSeconds),
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
          "-t",
          String(this.config.recordSeconds),
          "-ac",
          "1",
          "-ar",
          "16000",
          audioFile
        ];

    await run("ffmpeg", args);
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

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}
