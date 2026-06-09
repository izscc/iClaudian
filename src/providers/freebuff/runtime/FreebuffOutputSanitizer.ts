const ESC = '\u001b';
const BEL = '\u0007';
const ST = `${ESC}\\`;

export function hasFreebuffTerminalControl(text: string): boolean {
  return text.includes(ESC);
}

export function sanitizeFreebuffProcessOutput(text: string): string {
  if (!text) return '';
  return hasFreebuffTerminalControl(text)
    ? renderTerminalScreen(text)
    : stripControlCharacters(text);
}

function renderTerminalScreen(text: string): string {
  let screen: string[][] = [[]];
  let lastAlternateScreen = '';
  let row = 0;
  let col = 0;
  let savedRow = 0;
  let savedCol = 0;

  const ensureRow = (targetRow: number): void => {
    while (screen.length <= targetRow) screen.push([]);
  };

  const clearScreen = (): void => {
    screen = [[]];
    row = 0;
    col = 0;
  };

  const render = (): string => cleanRenderedScreen(screen
    .map(line => line.join('').replace(/\s+$/u, ''))
    .join('\n'));

  const writeChar = (char: string): void => {
    if (char === '\r') {
      col = 0;
      return;
    }
    if (char === '\n') {
      row += 1;
      col = 0;
      ensureRow(row);
      return;
    }
    if (char === '\b') {
      col = Math.max(0, col - 1);
      return;
    }
    if (char === '\t') {
      const nextTab = col + (4 - (col % 4));
      while (col < nextTab) writeChar(' ');
      return;
    }
    if (isControlCharacter(char)) return;

    ensureRow(row);
    screen[row][col] = char;
    col += 1;
  };

  const handleCsi = (body: string, final: string): void => {
    const rawParams = body.replace(/^[?>!]+/u, '');
    const params = rawParams
      .split(';')
      .map(part => Number.parseInt(part, 10))
      .map(value => Number.isFinite(value) ? value : 0);
    const first = params[0] || 0;

    if (body.includes('?1049') && final === 'h') {
      clearScreen();
      return;
    }
    if (body.includes('?1049') && final === 'l') {
      lastAlternateScreen = render();
      clearScreen();
      return;
    }

    switch (final) {
      case 'H':
      case 'f':
        row = Math.max(0, (params[0] || 1) - 1);
        col = Math.max(0, (params[1] || 1) - 1);
        ensureRow(row);
        break;
      case 'A':
        row = Math.max(0, row - (first || 1));
        break;
      case 'B':
        row += first || 1;
        ensureRow(row);
        break;
      case 'C':
        col += first || 1;
        break;
      case 'D':
        col = Math.max(0, col - (first || 1));
        break;
      case 'G':
        col = Math.max(0, (first || 1) - 1);
        break;
      case 'J':
        if (first === 2 || first === 3) clearScreen();
        break;
      case 'K':
        ensureRow(row);
        if (first === 1) screen[row].splice(0, col + 1);
        else if (first === 2) screen[row] = [];
        else screen[row].splice(col);
        break;
      case 's':
        savedRow = row;
        savedCol = col;
        break;
      case 'u':
        row = savedRow;
        col = savedCol;
        ensureRow(row);
        break;
      default:
        break;
    }
  };

  for (let index = 0; index < text.length;) {
    const char = text[index]!;
    if (char !== ESC) {
      const codePoint = text.codePointAt(index);
      const value = codePoint === undefined ? char : String.fromCodePoint(codePoint);
      writeChar(value);
      index += value.length;
      continue;
    }

    const next = text[index + 1];
    if (!next) break;

    if (next === '[') {
      const end = findCsiEnd(text, index + 2);
      if (end < 0) break;
      handleCsi(text.slice(index + 2, end), text[end]!);
      index = end + 1;
      continue;
    }

    if (next === ']') {
      index = skipUntilTerminator(text, index + 2);
      continue;
    }

    if (next === 'P' || next === '_' || next === '^' || next === 'X') {
      index = skipUntilTerminator(text, index + 2);
      continue;
    }

    if (next === '7') {
      savedRow = row;
      savedCol = col;
    } else if (next === '8') {
      row = savedRow;
      col = savedCol;
      ensureRow(row);
    }
    index += 2;
  }

  if (lastAlternateScreen.trim()) {
    return lastAlternateScreen;
  }
  return render();
}

function findCsiEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index;
  }
  return -1;
}

function skipUntilTerminator(text: string, start: number): number {
  const stIndex = text.indexOf(ST, start);
  const belIndex = text.indexOf(BEL, start);
  if (stIndex < 0 && belIndex < 0) return text.length;
  if (stIndex >= 0 && (belIndex < 0 || stIndex < belIndex)) return stIndex + ST.length;
  return belIndex + BEL.length;
}

function cleanRenderedScreen(text: string): string {
  return stripControlCharacters(text)
    .split('\n')
    .map(line => line.replace(/\s+$/u, ''))
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed === '✕' || trimmed === '×') return false;
      if (/^[─━═-]+$/u.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function stripControlCharacters(text: string): string {
  let result = '';
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    const char = codePoint === undefined ? text[index]! : String.fromCodePoint(codePoint);
    if (!isControlCharacter(char)) result += char;
    index += char.length;
  }
  return result;
}

function isControlCharacter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code < 0x20 && char !== '\n' && char !== '\r' && char !== '\t' && char !== '\b') || code === 0x7f;
}
