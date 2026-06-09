import type {
  TitleGenerationCallback,
  TitleGenerationService,
} from '../../../core/providers/types';
import type ClaudianPlugin from '../../../main';

export class FreebuffTitleGenerationService implements TitleGenerationService {
  constructor(_plugin: ClaudianPlugin) {}

  async generateTitle(
    conversationId: string,
    _userMessage: string,
    callback: TitleGenerationCallback,
  ): Promise<void> {
    await callback(conversationId, {
      success: false,
      error: 'Freebuff title generation is disabled because the Freebuff CLI allows only one active instance per account.',
    });
  }

  cancel(): void {}
}
