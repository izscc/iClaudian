import type { Writable } from 'node:stream';

import { sanitizeFreebuffProcessOutput } from './FreebuffOutputSanitizer';

const ESC = '\u001b';
const MODEL_PICKER_PATTERN = /Pick a model to start/u;
const CHAT_INPUT_PATTERN = /Enter a coding task/u;

export class FreebuffTuiAutomation {
  private buffer = '';
  private rawBuffer = '';
  private modelConfirmed = false;
  private promptSent = false;

  constructor(
    private readonly stdin: Writable,
    promptText: string,
  ) {
    this.promptText = normalizePromptForTui(promptText);
  }

  private readonly promptText: string;

  handleOutput(text: string): void {
    this.rawBuffer = (this.rawBuffer + text).slice(-100_000);
    const visibleOutput = sanitizeFreebuffProcessOutput(this.rawBuffer);
    this.buffer = `${this.rawBuffer}\n${visibleOutput}`.slice(-30_000);

    if (!this.modelConfirmed && MODEL_PICKER_PATTERN.test(this.buffer) && !CHAT_INPUT_PATTERN.test(this.buffer)) {
      this.stdin.write('\r');
      this.modelConfirmed = true;
      return;
    }

    if (!this.promptSent && CHAT_INPUT_PATTERN.test(this.buffer)) {
      this.sendPrompt();
    }
  }

  hasSentPrompt(): boolean {
    return this.promptSent;
  }

  private sendPrompt(): void {
    if (this.promptSent) return;
    this.stdin.write(toBracketedPaste(this.promptText));
    this.writeEnterAfter(100);
    this.writeEnterAfter(600);
    this.promptSent = true;
  }

  private writeEnterAfter(delayMs: number): void {
    const timer = setTimeout(() => {
      if (!this.stdin.destroyed) this.stdin.write('\r');
    }, delayMs);
    timer.unref?.();
  }
}

function toBracketedPaste(text: string): string {
  const safeText = text.replace(new RegExp(`${ESC}\\[(?:200|201)~`, 'gu'), '');
  return `\x1b[200~${safeText}\x1b[201~`;
}

function normalizePromptForTui(promptText: string): string {
  return promptText.replace(/\r\n?/gu, '\n').replace(/\n$/u, '');
}
