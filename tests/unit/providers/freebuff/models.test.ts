import {
  decodeFreebuffModelId,
  encodeFreebuffModelId,
  FREEBUFF_SYNTHETIC_MODEL_ID,
  freebuffModeToCliArgs,
  isFreebuffModelSelectionId,
} from '@/providers/freebuff/models';
import { freebuffChatUIConfig } from '@/providers/freebuff/ui/FreebuffChatUIConfig';

describe('freebuff models', () => {
  it('encodes and decodes Freebuff/Codebuff modes', () => {
    expect(FREEBUFF_SYNTHETIC_MODEL_ID).toBe('freebuff');
    expect(encodeFreebuffModelId('freebuff')).toBe('freebuff:freebuff');
    expect(encodeFreebuffModelId('codebuff-max')).toBe('freebuff:codebuff-max');
    expect(decodeFreebuffModelId('freebuff:codebuff-lite')).toBe('codebuff-lite');
    expect(isFreebuffModelSelectionId('freebuff:codebuff-plan')).toBe(true);
    expect(isFreebuffModelSelectionId('opencode:codebuff-plan')).toBe(false);
  });

  it('maps selected mode to the executable and mode flags before the prompt', () => {
    expect(freebuffModeToCliArgs('freebuff')).toEqual({ executable: 'freebuff', modeArgs: [], promptAsArg: false });
    expect(freebuffModeToCliArgs('codebuff')).toEqual({ executable: 'codebuff', modeArgs: [], promptAsArg: true });
    expect(freebuffModeToCliArgs('codebuff-lite')).toEqual({ executable: 'codebuff', modeArgs: ['--lite'], promptAsArg: true });
    expect(freebuffModeToCliArgs('codebuff-max')).toEqual({ executable: 'codebuff', modeArgs: ['--max'], promptAsArg: true });
    expect(freebuffModeToCliArgs('codebuff-plan')).toEqual({ executable: 'codebuff', modeArgs: ['--plan'], promptAsArg: true });
  });

  it('exposes model selector options that skip the terminal model picker', () => {
    expect(freebuffChatUIConfig.getModelOptions({})).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'freebuff:freebuff', label: 'Freebuff' }),
      expect.objectContaining({ value: 'freebuff:codebuff-lite', label: 'Codebuff Lite' }),
      expect.objectContaining({ value: 'freebuff:codebuff-plan', label: 'Codebuff Plan' }),
    ]));
  });
});
