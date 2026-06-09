export type FreebuffMode = 'freebuff' | 'codebuff' | 'codebuff-lite' | 'codebuff-max' | 'codebuff-plan';

export interface FreebuffModeOption {
  description: string;
  label: string;
  mode: FreebuffMode;
}

export const FREEBUFF_SYNTHETIC_MODEL_ID = 'freebuff';
export const FREEBUFF_MODEL_PREFIX = 'freebuff:';

export const FREEBUFF_MODE_OPTIONS: readonly FreebuffModeOption[] = Object.freeze([
  {
    description: 'Free, ad-supported Freebuff runtime',
    label: 'Freebuff',
    mode: 'freebuff',
  },
  {
    description: 'Codebuff default multi-agent runtime',
    label: 'Codebuff Default',
    mode: 'codebuff',
  },
  {
    description: 'Codebuff Lite mode',
    label: 'Codebuff Lite',
    mode: 'codebuff-lite',
  },
  {
    description: 'Codebuff Max mode',
    label: 'Codebuff Max',
    mode: 'codebuff-max',
  },
  {
    description: 'Codebuff Plan mode',
    label: 'Codebuff Plan',
    mode: 'codebuff-plan',
  },
]);

const VALID_MODES = new Set<FreebuffMode>(FREEBUFF_MODE_OPTIONS.map(option => option.mode));

export function normalizeFreebuffMode(value: unknown): FreebuffMode {
  return typeof value === 'string' && VALID_MODES.has(value.trim() as FreebuffMode)
    ? value.trim() as FreebuffMode
    : 'freebuff';
}

export function encodeFreebuffModelId(mode: string): string {
  const normalized = normalizeFreebuffMode(mode);
  return `${FREEBUFF_MODEL_PREFIX}${normalized}`;
}

export function decodeFreebuffModelId(model: string): FreebuffMode | null {
  if (model === FREEBUFF_SYNTHETIC_MODEL_ID) return 'freebuff';
  if (!model.startsWith(FREEBUFF_MODEL_PREFIX)) return null;
  return normalizeFreebuffMode(model.slice(FREEBUFF_MODEL_PREFIX.length));
}

export function isFreebuffModelSelectionId(model: string): boolean {
  return model === FREEBUFF_SYNTHETIC_MODEL_ID || model.startsWith(FREEBUFF_MODEL_PREFIX);
}

export function freebuffModeToCliArgs(mode: FreebuffMode): {
  executable: 'freebuff' | 'codebuff';
  modeArgs: string[];
  promptAsArg: boolean;
} {
  switch (mode) {
    case 'codebuff':
      return { executable: 'codebuff', modeArgs: [], promptAsArg: true };
    case 'codebuff-lite':
      return { executable: 'codebuff', modeArgs: ['--lite'], promptAsArg: true };
    case 'codebuff-max':
      return { executable: 'codebuff', modeArgs: ['--max'], promptAsArg: true };
    case 'codebuff-plan':
      return { executable: 'codebuff', modeArgs: ['--plan'], promptAsArg: true };
    case 'freebuff':
    default:
      return { executable: 'freebuff', modeArgs: [], promptAsArg: false };
  }
}
