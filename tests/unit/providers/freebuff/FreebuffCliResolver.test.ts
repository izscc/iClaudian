import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveFreebuffCliPath } from '@/providers/freebuff/runtime/FreebuffCliResolver';

describe('resolveFreebuffCliPath', () => {
  const originalHome = process.env.HOME;
  const originalHermes = process.env.HERMES_HOME;
  let tempHome = '';

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-resolver-'));
    process.env.HOME = tempHome;
    delete process.env.HERMES_HOME;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalHermes === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = originalHermes;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('prefers configured paths', () => {
    const configured = path.join(tempHome, 'bin', 'freebuff');
    fs.mkdirSync(path.dirname(configured), { recursive: true });
    fs.writeFileSync(configured, '');

    expect(resolveFreebuffCliPath(configured, '', '')).toBe(configured);
  });

  it('auto-detects Hermes npm installs when GUI PATH is minimal', () => {
    const hermesFreebuff = path.join(tempHome, '.hermes', 'node', 'bin', 'freebuff');
    fs.mkdirSync(path.dirname(hermesFreebuff), { recursive: true });
    fs.writeFileSync(hermesFreebuff, '');

    expect(resolveFreebuffCliPath('', '', '')).toBe(hermesFreebuff);
  });
});
