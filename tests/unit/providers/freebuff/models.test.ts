import {
  decodeFreebuffModelId,
  encodeFreebuffModelId,
  FREEBUFF_MODEL_OPTIONS,
  FREEBUFF_SYNTHETIC_MODEL_ID,
  freebuffModelToCliArgs,
  isFreebuffModelSelectionId,
} from '@/providers/freebuff/models';
import { freebuffChatUIConfig } from '@/providers/freebuff/ui/FreebuffChatUIConfig';

describe('freebuff models', () => {
  it('encodes and decodes Freebuff built-in model selections', () => {
    expect(FREEBUFF_SYNTHETIC_MODEL_ID).toBe('freebuff');
    expect(encodeFreebuffModelId('deepseek-v4-pro')).toBe('freebuff:deepseek-v4-pro');
    expect(encodeFreebuffModelId('minimax-m2.7')).toBe('freebuff:minimax-m2.7');
    expect(decodeFreebuffModelId('freebuff:kimi-k2.6')).toBe('kimi-k2.6');
    expect(isFreebuffModelSelectionId('freebuff:mimo-2.5')).toBe(true);
    expect(isFreebuffModelSelectionId('freebuff:unknown-model')).toBe(false);
  });

  it('always invokes the freebuff executable and sends prompt over stdin', () => {
    expect(freebuffModelToCliArgs('deepseek-v4-pro')).toEqual({
      executable: 'freebuff',
      modelArgs: [],
      promptAsArg: false,
    });
    expect(freebuffModelToCliArgs('minimax-m2.7')).toEqual({
      executable: 'freebuff',
      modelArgs: [],
      promptAsArg: false,
    });
  });

  it('exposes only Freebuff built-in models grouped as Premium and Unlimited', () => {
    const options = freebuffChatUIConfig.getModelOptions({});
    expect(options.map(option => option.label)).toEqual([
      'DeepSeek V4 Pro',
      'MiniMax M3',
      'MiMo 2.5 Pro',
      'Kimi K2.6',
      'DeepSeek V4 Flash',
      'MiMo 2.5',
      'MiniMax M2.7',
    ]);
    expect(options.map(option => option.group)).toEqual([
      'Premium',
      'Premium',
      'Premium',
      'Premium',
      'Unlimited',
      'Unlimited',
      'Unlimited',
    ]);
    expect(options.every(option => option.value.startsWith('freebuff:'))).toBe(true);
    expect(FREEBUFF_MODEL_OPTIONS).toHaveLength(7);
  });
});
