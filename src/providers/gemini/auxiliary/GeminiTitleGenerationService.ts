import type {
  TitleGenerationCallback,
  TitleGenerationService,
} from '../../../core/providers/types';

const GEMINI_TITLE_MAX_CHARS = 10;
const GEMINI_TITLE_FALLBACK = '新对话';

// Gemini gets no model-generated titles: the auxiliary `gemini --prompt` title
// query has been observed activating skills and running tools off the title
// prompt (rogue session f0d21429), and a model round-trip buys nothing over the
// user's own words. Use the first line of the first request, capped at 10 chars.
export function deriveGeminiLocalTitle(userMessage: string): string {
  const firstLine = userMessage
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0) ?? '';
  const collapsed = firstLine.replace(/\s+/g, ' ');
  const chars = Array.from(collapsed);
  const title = chars.slice(0, GEMINI_TITLE_MAX_CHARS).join('');
  return title || GEMINI_TITLE_FALLBACK;
}

export class GeminiTitleGenerationService implements TitleGenerationService {
  async generateTitle(
    conversationId: string,
    userMessage: string,
    callback: TitleGenerationCallback,
  ): Promise<void> {
    try {
      await callback(conversationId, { success: true, title: deriveGeminiLocalTitle(userMessage) });
    } catch {
      // Ignore callback failures to match existing service behavior.
    }
  }

  cancel(): void {}
}
