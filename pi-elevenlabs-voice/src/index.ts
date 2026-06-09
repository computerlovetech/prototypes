import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  ExtensionFactory
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { KeyId } from "@earendil-works/pi-tui";
import { findExecutable, loadConfig } from "./config.ts";
import { VOICE_SYSTEM_PROMPT } from "./prompt.ts";
import { VoiceRecorder } from "./stt.ts";
import { assistantText, extractSpeakTags, SentenceBuffer } from "./text.ts";
import { ElevenLabsTts } from "./tts.ts";

type MessageUpdateEvent = Extract<ExtensionEvent, { type: "message_update" }>;
type MessageEndEvent = Extract<ExtensionEvent, { type: "message_end" }>;

const extension: ExtensionFactory = (pi: ExtensionAPI) => {
  const config = loadConfig();
  const tts = new ElevenLabsTts(config);
  const recorder = new VoiceRecorder(config);
  const streamBuffer = new SentenceBuffer(config.maxSentenceChars);

  pi.on("session_start", (_event, ctx) => {
    const problems = diagnostics();
    if (problems.length > 0) {
      ctx.ui.setStatus("voice", "voice: setup needed");
      ctx.ui.notify(`Voice setup needed: ${problems.join("; ")}`, "warning");
      return;
    }

    ctx.ui.setStatus("voice", `voice: ready ${displayShortcut(config.continuousShortcut)}`);
  });

  pi.on("session_shutdown", async () => {
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

  pi.registerShortcut(config.shortcut as KeyId, {
    description: "Record a timed voice message",
    handler: async (ctx) => {
      await recordAndSend(pi, recorder, tts, ctx);
    }
  });

  pi.registerShortcut(config.continuousShortcut as KeyId, {
    description: "Toggle continuous voice recording",
    handler: async (ctx) => {
      await toggleRecording(pi, recorder, tts, ctx);
    }
  });

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
        await recordAndSend(pi, recorder, tts, ctx);
        return;
      }
      if (command === "start") {
        await startRecording(recorder, tts, ctx);
        return;
      }
      if (command === "stop") {
        await stopRecordingAndSend(pi, recorder, ctx);
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
        `${displayShortcut(config.continuousShortcut)} - start/stop continuous listening`,
        `${displayShortcut(config.shortcut)} - timed recording`
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

async function toggleRecording(
  pi: ExtensionAPI,
  recorder: VoiceRecorder,
  tts: ElevenLabsTts,
  ctx: ExtensionContext
): Promise<void> {
  if (recorder.isRecording) {
    await stopRecordingAndSend(pi, recorder, ctx);
  } else {
    await startRecording(recorder, tts, ctx);
  }
}

async function startRecording(
  recorder: VoiceRecorder,
  tts: ElevenLabsTts,
  ctx: ExtensionContext
): Promise<void> {
  try {
    tts.interrupt();
    await recorder.start();
    ctx.ui.setStatus("voice", "voice: listening");
    ctx.ui.notify("Listening. Press Control+Option+C again, or run /voice stop, to send.", "info");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Voice input failed: ${message}`, "error");
    ctx.ui.setStatus("voice", "voice: ready");
  }
}

async function stopRecordingAndSend(
  pi: ExtensionAPI,
  recorder: VoiceRecorder,
  ctx: ExtensionContext
): Promise<void> {
  try {
    ctx.ui.setStatus("voice", "voice: transcribing");
    const transcript = await recorder.stopAndTranscribe();
    sendTranscript(pi, ctx, transcript);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Voice input failed: ${message}`, "error");
  } finally {
    ctx.ui.setStatus("voice", "voice: ready");
  }
}

async function recordAndSend(
  pi: ExtensionAPI,
  recorder: VoiceRecorder,
  tts: ElevenLabsTts,
  ctx: ExtensionContext
): Promise<void> {
  try {
    tts.interrupt();
    ctx.ui.setStatus("voice", "voice: listening");
    ctx.ui.notify("Listening for the timed recording duration...", "info");

    const transcript = await recorder.recordAndTranscribe();
    sendTranscript(pi, ctx, transcript);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Voice input failed: ${message}`, "error");
  } finally {
    ctx.ui.setStatus("voice", "voice: ready");
  }
}

function sendTranscript(pi: ExtensionAPI, ctx: ExtensionContext, transcript: string): void {
  const message = `<voice>${transcript}</voice>`;
  pi.sendUserMessage(message, ctx.isIdle() ? undefined : { deliverAs: "steer" });
  ctx.ui.notify(`Heard: ${transcript}`, "info");
}

function displayShortcut(shortcut: string): string {
  if (process.platform !== "darwin") return shortcut;
  return shortcut
    .replace(/\bctrl\b/gi, "Control")
    .replace(/\balt\b/gi, "Option")
    .replace(/\+/g, "+")
    .replace(/\bv\b/gi, "V");
}


export default extension;
