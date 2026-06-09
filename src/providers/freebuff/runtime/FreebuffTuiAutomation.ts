import type { Writable } from 'node:stream';

const MODEL_PICKER_PATTERN = /Pick a model to start|DeepSeek V4|MiniMax M|MiMo 2\.5|Kimi K2\.6|Collects data for training|Fastest/u;
const CHAT_INPUT_PATTERN = /Enter a coding task/u;

export class FreebuffTuiAutomation {
  private buffer = '';
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
    this.buffer = (this.buffer + text).slice(-30_000);

    if (!this.modelConfirmed && MODEL_PICKER_PATTERN.test(this.buffer)) {
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
    this.stdin.write(this.promptText);
    this.stdin.write('\r');
    this.promptSent = true;
  }
}

function normalizePromptForTui(promptText: string): string {
  return promptText.replace(/\r\n?/gu, '\n').replace(/\n$/u, '');
}
