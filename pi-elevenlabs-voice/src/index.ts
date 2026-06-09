import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  ExtensionFactory
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { isKeyRelease, isKeyRepeat, matchesKey, type KeyId } from "@earendil-works/pi-tui";
import { findExecutable, loadConfig } from "./config.ts";
import { VOICE_SYSTEM_PROMPT } from "./prompt.ts";
import { VoiceRecorder } from "./stt.ts";
import { assistantText, extractSpeakTags, SentenceBuffer } from "./text.ts";
import { ElevenLabsTts } from "./tts.ts";

type MessageUpdateEvent = Extract<ExtensionEvent, { type: "message_update" }>;
type MessageEndEvent = Extract<ExtensionEvent, { type: "message_end" }>;
type RecordingMode = "idle" | "hold" | "continuous" | "timed";

interface VoiceInputState {
  busy: boolean;
  mode: RecordingMode;
  holdFallback: ReturnType<typeof setTimeout> | undefined;
  lastShortcutAt: number;
  lastTranscript: string | undefined;
  lastTranscriptAt: number;
}

const extension: ExtensionFactory = (pi: ExtensionAPI) => {
  const config = loadConfig();
  const tts = new ElevenLabsTts(config);
  const recorder = new VoiceRecorder(config);
  const streamBuffer = new SentenceBuffer(config.maxSentenceChars);
  const inputState: VoiceInputState = {
    busy: false,
    mode: "idle",
    holdFallback: undefined,
    lastShortcutAt: 0,
    lastTranscript: undefined,
    lastTranscriptAt: 0
  };

  pi.on("session_start", (_event, ctx) => {
    const problems = diagnostics();
    if (problems.length > 0) {
      ctx.ui.setStatus("voice", "voice: setup needed");
      ctx.ui.notify(`Voice setup needed: ${problems.join("; ")}`, "warning");
      return;
    }

    ctx.ui.setStatus("voice", `voice: ready ${displayShortcut(config.continuousShortcut)}`);
    ctx.ui.onTerminalInput((data) => {
      if (matchesKey(data, config.shortcut as KeyId)) {
        void handleHoldShortcut(data, pi, recorder, tts, ctx, inputState, config.recordSeconds);
        return { consume: true };
      }
      if (matchesKey(data, config.continuousShortcut as KeyId)) {
        void handleContinuousShortcut(data, pi, recorder, tts, ctx, inputState);
        return { consume: true };
      }
      return undefined;
    });
  });

  pi.on("session_shutdown", async () => {
    clearHoldFallback(inputState);
    await tts.shutdown();
  });

  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n${VOICE_SYSTEM_PROMPT}`
  }));

  pi.on("message_update", (event) => {
    if (config.ttsMode !== "stream") return;
    handleStreamingTts(event);
  });

  pi.on("message_end", (event) => handleFinalMessage(event));

  pi.registerCommand("voice", {
    description: "Control ElevenLabs voice input and output",
    getArgumentCompletions: (prefix) => {
      const options = ["status", "test", "start", "stop", "record", "interrupt", "help"];
      return options
        .filter((option) => option.startsWith(prefix.trim()))
        .map((option) => ({ value: option, label: option }));
    },
    handler: async (args, ctx) => {
      const command = args.trim() || "status";
      if (command === "status") {
        showStatus(ctx);
        return;
      }
      if (command === "test") {
        tts.enqueue("Voice output is working.");
        ctx.ui.notify("Voice test queued.", "info");
        return;
      }
      if (command === "record") {
        await recordAndSend(pi, recorder, tts, ctx, inputState);
        return;
      }
      if (command === "start") {
        await startRecording(recorder, tts, ctx, inputState, "continuous");
        return;
      }
      if (command === "stop") {
        await stopRecordingAndSend(pi, recorder, ctx, inputState);
        return;
      }
      if (command === "interrupt") {
        tts.interrupt();
        ctx.abort();
        ctx.ui.notify("Voice playback and current turn interrupted.", "info");
        return;
      }
      if (command === "help") {
        showHelp(ctx);
        return;
      }

      ctx.ui.notify(`Unknown voice command: ${command}`, "warning");
      showHelp(ctx);
    }
  });

  function handleStreamingTts(event: MessageUpdateEvent): void {
    const update = event.assistantMessageEvent;
    if (update.type === "text_delta") {
      for (const sentence of streamBuffer.push(update.delta)) {
        tts.enqueue(sentence);
      }
    }
    if (update.type === "text_end" || update.type === "done" || update.type === "error") {
      const rest = streamBuffer.flush();
      if (rest) tts.enqueue(rest);
    }
  }

  function handleFinalMessage(event: MessageEndEvent): { message?: MessageEndEvent["message"] } | undefined {
    if (event.message.role !== "assistant") return undefined;
    const message = event.message as AssistantMessage;
    const text = assistantText(message);
    if (!text) return undefined;

    const { spoken, display } = extractSpeakTags(text);
    if (config.ttsMode === "final") {
      if (spoken.length > 0) {
        spoken.forEach((part) => tts.enqueue(part));
      } else {
        tts.enqueue(text);
      }
    }

    if (spoken.length === 0) return undefined;
    return {
      message: {
        ...message,
        content: message.content.map((part) =>
          part.type === "text" ? { ...part, text: display } : part
        )
      }
    };
  }

  function showStatus(ctx: ExtensionContext): void {
    const problems = diagnostics();
    const lines = [
      `Voice: ${problems.length === 0 ? "ready" : "setup needed"}`,
      `Timed shortcut: ${displayShortcut(config.shortcut)}`,
      `Continuous shortcut: ${displayShortcut(config.continuousShortcut)}`,
      `TTS mode: ${config.ttsMode}`,
      `Record seconds: ${config.recordSeconds}`,
      `Listening: ${recorder.isRecording ? "yes" : "no"}`,
      `Voice ID: ${config.voiceId}`,
      problems.length > 0 ? `Problems: ${problems.join("; ")}` : undefined
    ].filter(Boolean);

    ctx.ui.notify(lines.join("\n"), problems.length > 0 ? "warning" : "info");
  }

  function showHelp(ctx: ExtensionContext): void {
    ctx.ui.notify(
      [
        "/voice status - show setup and mode",
        "/voice test - speak a short test phrase",
        "/voice start - start listening",
        "/voice stop - stop listening, transcribe, and send",
        "/voice record - timed recording, then transcribe and send",
        "/voice interrupt - stop speech and abort the current turn",
        `${displayShortcut(config.shortcut)} - hold to talk when key-release events are available`,
        `${displayShortcut(config.continuousShortcut)} - start/stop continuous listening`
      ].join("\n"),
      "info"
    );
  }

  function diagnostics(): string[] {
    const problems: string[] = [];
    if (!config.apiKey) problems.push("ELEVENLABS_API_KEY missing");
    if (!findExecutable("ffmpeg")) problems.push("ffmpeg missing");
    if (!findExecutable(config.playerCommand)) problems.push(`${config.playerCommand} missing`);
    return problems;
  }
};

async function handleHoldShortcut(
  data: string,
  pi: ExtensionAPI,
  recorder: VoiceRecorder,
  tts: ElevenLabsTts,
  ctx: ExtensionContext,
  state: VoiceInputState,
  fallbackSeconds: number
): Promise<void> {
  if (isKeyRepeat(data) || tooSoon(state, 120)) return;

  if (isKeyRelease(data)) {
    if (state.mode === "hold" && recorder.isRecording) {
      await stopRecordingAndSend(pi, recorder, ctx, state);
    }
    return;
  }

  if (recorder.isRecording || state.busy) return;

  await startRecording(recorder, tts, ctx, state, "hold");
  clearHoldFallback(state);
  state.holdFallback = setTimeout(() => {
    if (state.mode === "hold" && recorder.isRecording && !state.busy) {
      ctx.ui.notify("No key release detected. Stopping voice input automatically.", "warning");
      void stopRecordingAndSend(pi, recorder, ctx, state);
    }
  }, Math.max(1, fallbackSeconds) * 1000);
}

async function handleContinuousShortcut(
  data: string,
  pi: ExtensionAPI,
  recorder: VoiceRecorder,
  tts: ElevenLabsTts,
  ctx: ExtensionContext,
  state: VoiceInputState
): Promise<void> {
  if (isKeyRelease(data) || isKeyRepeat(data) || tooSoon(state, 600)) return;

  if (recorder.isRecording) {
    if (state.mode === "continuous") {
      await stopRecordingAndSend(pi, recorder, ctx, state);
    }
    return;
  }

  await startRecording(recorder, tts, ctx, state, "continuous");
}

async function startRecording(
  recorder: VoiceRecorder,
  tts: ElevenLabsTts,
  ctx: ExtensionContext,
  state: VoiceInputState,
  mode: Exclude<RecordingMode, "idle" | "timed">
): Promise<void> {
  if (state.busy || recorder.isRecording) return;
  state.busy = true;
  try {
    tts.interrupt();
    await recorder.start();
    state.mode = mode;
    ctx.ui.setStatus("voice", "voice: listening");
    ctx.ui.notify(recordingStartedMessage(mode), "info");
  } catch (error) {
    state.mode = "idle";
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Voice input failed: ${message}`, "error");
    ctx.ui.setStatus("voice", "voice: ready");
  } finally {
    state.busy = false;
  }
}

async function stopRecordingAndSend(
  pi: ExtensionAPI,
  recorder: VoiceRecorder,
  ctx: ExtensionContext,
  state: VoiceInputState
): Promise<void> {
  if (state.busy || !recorder.isRecording) return;
  state.busy = true;
  try {
    clearHoldFallback(state);
    ctx.ui.setStatus("voice", "voice: transcribing");
    const transcript = await recorder.stopAndTranscribe();
    sendTranscript(pi, ctx, transcript, state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Voice input failed: ${message}`, "error");
  } finally {
    state.mode = "idle";
    state.busy = false;
    ctx.ui.setStatus("voice", "voice: ready");
  }
}

async function recordAndSend(
  pi: ExtensionAPI,
  recorder: VoiceRecorder,
  tts: ElevenLabsTts,
  ctx: ExtensionContext,
  state: VoiceInputState
): Promise<void> {
  if (state.busy || recorder.isRecording) return;
  state.busy = true;
  state.mode = "timed";
  try {
    tts.interrupt();
    ctx.ui.setStatus("voice", "voice: listening");
    ctx.ui.notify("Listening for the timed recording duration...", "info");

    const transcript = await recorder.recordAndTranscribe();
    sendTranscript(pi, ctx, transcript, state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Voice input failed: ${message}`, "error");
  } finally {
    state.mode = "idle";
    state.busy = false;
    ctx.ui.setStatus("voice", "voice: ready");
  }
}

function sendTranscript(pi: ExtensionAPI, ctx: ExtensionContext, transcript: string, state: VoiceInputState): void {
  const now = Date.now();
  if (state.lastTranscript === transcript && now - state.lastTranscriptAt < 5000) {
    ctx.ui.notify("Ignored duplicate voice transcript.", "warning");
    return;
  }
  state.lastTranscript = transcript;
  state.lastTranscriptAt = now;

  const message = `<voice>${transcript}</voice>`;
  pi.sendUserMessage(message, ctx.isIdle() ? undefined : { deliverAs: "steer" });
  ctx.ui.notify(`Heard: ${transcript}`, "info");
}

function tooSoon(state: VoiceInputState, ms: number): boolean {
  const now = Date.now();
  if (now - state.lastShortcutAt < ms) return true;
  state.lastShortcutAt = now;
  return false;
}

function clearHoldFallback(state: VoiceInputState): void {
  if (state.holdFallback) {
    clearTimeout(state.holdFallback);
    state.holdFallback = undefined;
  }
}

function recordingStartedMessage(mode: RecordingMode): string {
  if (mode === "hold") {
    return "Listening. Release Control+Option+V to send. If your terminal does not report key release, it will stop after the timed recording duration.";
  }
  return "Listening. Press Control+Option+C again, or run /voice stop, to send.";
}

function displayShortcut(shortcut: string): string {
  if (process.platform !== "darwin") return shortcut;
  return shortcut
    .replace(/\bctrl\b/gi, "Control")
    .replace(/\balt\b/gi, "Option")
    .replace(/\+/g, "+")
    .replace(/\bv\b/gi, "V")
    .replace(/\bc\b/gi, "C");
}

export default extension;
