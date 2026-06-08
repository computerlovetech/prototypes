import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { VoiceConfig } from "./config.ts";

interface QueueItem {
  text: string;
}

export class ElevenLabsTts {
  private readonly queue: QueueItem[] = [];
  private running = false;
  private stopped = false;
  private currentPlayer: ChildProcess | undefined;
  private readonly notPlayingListeners = new Set<() => void>();

  constructor(private readonly config: VoiceConfig) {}

  get isPlaying(): boolean {
    return this.currentPlayer !== undefined;
  }

  enqueue(text: string): void {
    const clean = normalizeForSpeech(text);
    if (!clean || this.stopped || this.config.ttsMode === "off") return;
    this.queue.push({ text: clean });
    void this.drain();
  }

  interrupt(): void {
    this.queue.length = 0;
    if (this.currentPlayer && !this.currentPlayer.killed) {
      this.currentPlayer.kill("SIGTERM");
    }
  }

  onNotPlaying(listener: () => void): () => void {
    this.notPlayingListeners.add(listener);
    return () => this.notPlayingListeners.delete(listener);
  }

  async shutdown(): Promise<void> {
    this.stopped = true;
    this.interrupt();
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.stopped && this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) continue;
        await this.speak(item.text);
      }
    } finally {
      this.running = false;
    }
  }

  private async speak(text: string): Promise<void> {
    if (!this.config.apiKey) return;
    const audio = await this.fetchAudio(text);
    const dir = await mkdtemp(join(tmpdir(), "pi-voice-"));
    const audioFile = join(dir, "speech.mp3");

    try {
      await writeFile(audioFile, Buffer.from(audio));
      await this.play(audioFile);
    } finally {
      await rm(dir, { recursive: true, force: true });
      this.notPlayingListeners.forEach((listener) => listener());
    }
  }

  private async fetchAudio(text: string): Promise<ArrayBuffer> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.config.voiceId}/stream`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.config.apiKey ?? "",
        "content-type": "application/json",
        accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: this.config.ttsModelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS failed: ${response.status} ${await response.text()}`);
    }

    return response.arrayBuffer();
  }

  private async play(audioFile: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.config.playerCommand, [audioFile], { stdio: "ignore" });
      this.currentPlayer = child;

      child.once("error", reject);
      child.once("exit", (code, signal) => {
        this.currentPlayer = undefined;
        if (signal === "SIGTERM") {
          resolve();
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${this.config.playerCommand} exited with ${code ?? signal}`));
        }
      });
    });
  }
}

function normalizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "I am omitting a code block from speech.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
