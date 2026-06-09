export type FreebuffModelId =
  | 'deepseek-v4-pro'
  | 'minimax-m3'
  | 'mimo-2.5-pro'
  | 'kimi-k2.6'
  | 'deepseek-v4-flash'
  | 'mimo-2.5'
  | 'minimax-m2.7';

export interface FreebuffModelOption {
  description: string;
  group: 'Premium' | 'Unlimited';
  label: string;
  modelId: FreebuffModelId;
  nativeModelId: string;
}

export const FREEBUFF_SYNTHETIC_MODEL_ID = 'freebuff';
export const FREEBUFF_MODEL_PREFIX = 'freebuff:';

export const FREEBUFF_MODEL_OPTIONS: readonly FreebuffModelOption[] = Object.freeze([
  {
    description: 'Smartest · Collects data for training',
    group: 'Premium',
    label: 'DeepSeek V4 Pro',
    modelId: 'deepseek-v4-pro',
    nativeModelId: 'deepseek/deepseek-v4-pro',
  },
  {
    description: 'Smartest & multimodal · Collects data for training',
    group: 'Premium',
    label: 'MiniMax M3',
    modelId: 'minimax-m3',
    nativeModelId: 'minimax/minimax-m3',
  },
  {
    description: 'Smartest & Slow',
    group: 'Premium',
    label: 'MiMo 2.5 Pro',
    modelId: 'mimo-2.5-pro',
    nativeModelId: 'mimo/mimo-v2.5-pro',
  },
  {
    description: 'Balanced',
    group: 'Premium',
    label: 'Kimi K2.6',
    modelId: 'kimi-k2.6',
    nativeModelId: 'moonshotai/kimi-k2.6',
  },
  {
    description: 'Smart & Fast · Collects data for training',
    group: 'Unlimited',
    label: 'DeepSeek V4 Flash',
    modelId: 'deepseek-v4-flash',
    nativeModelId: 'deepseek/deepseek-v4-flash',
  },
  {
    description: 'Multimodal',
    group: 'Unlimited',
    label: 'MiMo 2.5',
    modelId: 'mimo-2.5',
    nativeModelId: 'mimo/mimo-v2.5',
  },
  {
    description: 'Fastest',
    group: 'Unlimited',
    label: 'MiniMax M2.7',
    modelId: 'minimax-m2.7',
    nativeModelId: 'minimax/minimax-m2.7',
  },
]);

const MODEL_BY_ID = new Map<FreebuffModelId, FreebuffModelOption>(
  FREEBUFF_MODEL_OPTIONS.map(option => [option.modelId, option]),
);
const VALID_MODEL_IDS = new Set<FreebuffModelId>(FREEBUFF_MODEL_OPTIONS.map(option => option.modelId));
const DEFAULT_FREEBUFF_MODEL_ID: FreebuffModelId = 'minimax-m2.7';

export function normalizeFreebuffModelId(value: unknown): FreebuffModelId {
  return typeof value === 'string' && VALID_MODEL_IDS.has(value.trim() as FreebuffModelId)
    ? value.trim() as FreebuffModelId
    : DEFAULT_FREEBUFF_MODEL_ID;
}

export function encodeFreebuffModelId(modelId: string): string {
  const normalized = normalizeFreebuffModelId(modelId);
  return `${FREEBUFF_MODEL_PREFIX}${normalized}`;
}

export function decodeFreebuffModelId(model: string): FreebuffModelId | null {
  if (model === FREEBUFF_SYNTHETIC_MODEL_ID) return DEFAULT_FREEBUFF_MODEL_ID;
  if (!model.startsWith(FREEBUFF_MODEL_PREFIX)) return null;
  const raw = model.slice(FREEBUFF_MODEL_PREFIX.length).trim();
  return VALID_MODEL_IDS.has(raw as FreebuffModelId) ? raw as FreebuffModelId : null;
}

export function isFreebuffModelSelectionId(model: string): boolean {
  if (model === FREEBUFF_SYNTHETIC_MODEL_ID) return true;
  return decodeFreebuffModelId(model) !== null;
}

export function getFreebuffNativeModelId(modelId: string): string {
  const normalized = normalizeFreebuffModelId(modelId);
  return MODEL_BY_ID.get(normalized)?.nativeModelId ?? MODEL_BY_ID.get(DEFAULT_FREEBUFF_MODEL_ID)!.nativeModelId;
}

export function freebuffModelToCliArgs(_modelId: FreebuffModelId): {
  executable: 'freebuff';
  modelArgs: string[];
  promptAsArg: boolean;
} {
  return { executable: 'freebuff', modelArgs: [], promptAsArg: false };
}
