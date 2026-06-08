import type { AssistantMessage } from "@earendil-works/pi-ai";

export function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function extractSpeakTags(text: string): { spoken: string[]; display: string } {
  const spoken: string[] = [];
  const display = text.replace(/<speak>([\s\S]*?)<\/speak>/gi, (_, inner: string) => {
    const cleaned = inner.trim();
    if (cleaned) spoken.push(cleaned);
    return "";
  });
  return { spoken, display: display.trim() };
}

export class SentenceBuffer {
  private buffer = "";

  constructor(private readonly maxChars: number) {}

  push(delta: string): string[] {
    this.buffer += delta;
    const ready: string[] = [];

    while (this.buffer.length >= this.maxChars) {
      const splitAt = findSplit(this.buffer, this.maxChars);
      ready.push(this.buffer.slice(0, splitAt).trim());
      this.buffer = this.buffer.slice(splitAt).trimStart();
    }

    const sentenceMatch = this.buffer.match(/^([\s\S]*?[.!?])(\s+|$)/);
    if (sentenceMatch?.[1] && sentenceMatch[1].length >= 24) {
      ready.push(sentenceMatch[1].trim());
      this.buffer = this.buffer.slice(sentenceMatch[0].length).trimStart();
    }

    return ready.filter(Boolean);
  }

  flush(): string | undefined {
    const text = this.buffer.trim();
    this.buffer = "";
    return text || undefined;
  }
}

function findSplit(text: string, maxChars: number): number {
  const slice = text.slice(0, maxChars);
  const candidates = [slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf(", "), slice.lastIndexOf(" ")];
  const best = Math.max(...candidates);
  return best > 40 ? best + 1 : maxChars;
}
