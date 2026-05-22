import {
  decodeAntigravityModelId,
  encodeAntigravityModelId,
} from '@/providers/antigravity/models';
import { normalizeAntigravityVisibleModels } from '@/providers/antigravity/settings';

describe('Antigravity model aliases', () => {
  it('normalizes the removed Gemini 3.5 Flash Low label to the real Medium label', () => {
    expect(encodeAntigravityModelId('Gemini 3.5 Flash (Low)')).toBe('antigravity:Gemini 3.5 Flash (Medium)');
    expect(decodeAntigravityModelId('antigravity:gemini-3.5-flash-low')).toBe('Gemini 3.5 Flash (Medium)');
    expect(normalizeAntigravityVisibleModels(['Gemini 3.5 Flash (Low)'])).toEqual(['Gemini 3.5 Flash (Medium)']);
  });

  it('maps internal Antigravity runtime model identifiers to visible CLI model labels', () => {
    expect(decodeAntigravityModelId('antigravity:gemini-3-flash-agent')).toBe('Gemini 3.5 Flash (High)');
    expect(decodeAntigravityModelId('antigravity:claude-sonnet-4-6@default')).toBe('Claude Sonnet 4.6 (Thinking)');
    expect(decodeAntigravityModelId('antigravity:openai/gpt-oss-120b-maas')).toBe('GPT-OSS 120B (Medium)');
  });
});
