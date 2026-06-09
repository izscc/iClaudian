import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readAssistantResponseFromFile } from '@/providers/freebuff/runtime/FreebuffChatStateWatcher';

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
