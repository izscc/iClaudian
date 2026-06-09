import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  readAssistantResponseFromFile,
  readCompletionFromLogFile,
  readPromptStartedFromLogFile,
} from '@/providers/freebuff/runtime/FreebuffChatStateWatcher';

describe('FreebuffChatStateWatcher', () => {
  it('extracts the latest assistant answer without reasoning blocks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-state-'));
    const file = path.join(dir, 'chat-messages.json');
    fs.writeFileSync(file, JSON.stringify([
      { variant: 'ai', blocks: [{ type: 'mode-divider', mode: 'LITE' }] },
      { variant: 'user', content: '只回复 OK' },
      {
        variant: 'ai',
        blocks: [
          { type: 'text', textType: 'reasoning', content: 'hidden reasoning' },
          { type: 'text', textType: 'text', content: 'OK' },
        ],
      },
    ]));

    try {
      expect(readAssistantResponseFromFile(file)).toBe('OK');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects when Freebuff has accepted the prompt from its log file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-state-'));
    const file = path.join(dir, 'log.jsonl');
    fs.writeFileSync(file, '{"msg":"Reconnection detected"}\n{"msg":"Start agent base2-free step 1"}\n');

    try {
      expect(readPromptStartedFromLogFile(file)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });



  it('reads completed assistant text directly from the Freebuff log', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-state-'));
    const file = path.join(dir, 'log.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ msg: 'Start agent base2-free step 3 (abc - Prompt: 只回复 OK)' }),
      JSON.stringify({
        msg: 'Main prompt finished',
        data: {
          output: {
            type: 'lastMessage',
            value: [
              { role: 'assistant', content: [{ type: 'reasoning', text: 'hidden' }] },
              { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
            ],
          },
        },
      }),
    ].join('\n'));

    try {
      expect(readCompletionFromLogFile(file, '只回复 OK')).toEqual({ type: 'text', content: 'OK' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads Freebuff session superseded errors from the log', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-state-'));
    const file = path.join(dir, 'log.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ msg: 'Start agent base2-free step 3 (abc - Prompt: 整理排版)' }),
      JSON.stringify({
        msg: 'Main prompt finished',
        data: { output: { type: 'error', message: 'Another instance of freebuff has taken over this session.' } },
      }),
    ].join('\n'));

    try {
      expect(readCompletionFromLogFile(file, '整理排版')).toEqual({
        type: 'error',
        message: 'Another instance of freebuff has taken over this session.',
      });
      expect(readCompletionFromLogFile(file, '只回复 OK')).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to assistant content when no text blocks exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-state-'));
    const file = path.join(dir, 'chat-messages.json');
    fs.writeFileSync(file, JSON.stringify([
      { variant: 'user', content: 'hello' },
      { variant: 'ai', content: 'plain answer' },
    ]));

    try {
      expect(readAssistantResponseFromFile(file)).toBe('plain answer');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
