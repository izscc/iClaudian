import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { persistFreebuffModelSelection } from '@/providers/freebuff/runtime/FreebuffModelSettings';

describe('persistFreebuffModelSelection', () => {
  it('writes the selected Freebuff model into the native manicode settings file', async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'freebuff-model-settings-'));
    const settingsPath = path.join(tempHome, '.config', 'manicode', 'settings.json');

    await persistFreebuffModelSelection('freebuff:minimax-m2.7', { homeDir: tempHome });

    await expect(fs.readFile(settingsPath, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      freebuffModel: 'minimax/minimax-m2.7',
    });
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('preserves unrelated Freebuff settings', async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'freebuff-model-settings-'));
    const settingsPath = path.join(tempHome, '.config', 'manicode', 'settings.json');
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, `${JSON.stringify({ adsEnabled: false, mode: 'LITE' }, null, 2)}\n`);

    await persistFreebuffModelSelection('freebuff:deepseek-v4-flash', { homeDir: tempHome });

    await expect(fs.readFile(settingsPath, 'utf8').then(JSON.parse)).resolves.toEqual({
      adsEnabled: false,
      freebuffModel: 'deepseek/deepseek-v4-flash',
      mode: 'LITE',
    });
    await fs.rm(tempHome, { recursive: true, force: true });
  });
});
