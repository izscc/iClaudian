import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { decodeFreebuffModelId, getFreebuffNativeModelId } from '../models';

export interface FreebuffModelSettingsOptions {
  homeDir?: string;
}

export function getFreebuffSettingsPath(options: FreebuffModelSettingsOptions = {}): string {
  return path.join(options.homeDir ?? os.homedir(), '.config', 'manicode', 'settings.json');
}

export async function persistFreebuffModelSelection(
  selectedModel: string | null | undefined,
  options: FreebuffModelSettingsOptions = {},
): Promise<void> {
  const modelId = selectedModel ? decodeFreebuffModelId(selectedModel) : null;
  if (!modelId) return;
  const settingsPath = getFreebuffSettingsPath(options);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const nativeModelId = getFreebuffNativeModelId(modelId);
  if (parsed.freebuffModel === nativeModelId) return;
  parsed.freebuffModel = nativeModelId;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}
