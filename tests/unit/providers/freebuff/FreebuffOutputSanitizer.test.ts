import { hasFreebuffTerminalControl, sanitizeFreebuffProcessOutput } from '@/providers/freebuff/runtime/FreebuffOutputSanitizer';

describe('FreebuffOutputSanitizer', () => {
  it('renders the last alternate-screen frame without ANSI control bytes', () => {
    const output = [
      '\x1b]10;?\x07',
      '\x1b[?1049h',
      '\x1b[1;1H\x1b[38;2;255;255;255mHello from Freebuff\x1b[0m',
      '\x1b[2;1HDone',
      '\x1b[?1049l\x1b[?25h',
    ].join('');

    expect(hasFreebuffTerminalControl(output)).toBe(true);
    expect(sanitizeFreebuffProcessOutput(output)).toBe('Hello from Freebuff\nDone');
  });

  it('preserves normal non-terminal CLI text', () => {
    expect(sanitizeFreebuffProcessOutput('plain answer\nnext line')).toBe('plain answer\nnext line');
  });
});
