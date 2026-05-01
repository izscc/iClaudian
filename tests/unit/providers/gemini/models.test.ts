import { decodeGeminiModelId, encodeGeminiModelId } from '@/providers/gemini/models';
import { normalizeGeminiVisibleModels } from '@/providers/gemini/settings';

describe('Gemini model aliases', () => {
  it('normalizes legacy Gemini 3.1 model IDs to the preview CLI ID', () => {
    expect(encodeGeminiModelId('gemini-3.1-pro')).toBe('gemini:gemini-3.1-pro-preview');
    expect(decodeGeminiModelId('gemini:gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
    expect(normalizeGeminiVisibleModels(['gemini-3.1-pro'])).toEqual(['gemini-3.1-pro-preview']);
  });
});
