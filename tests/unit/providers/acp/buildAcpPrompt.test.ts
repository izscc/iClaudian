import { buildAcpPromptBlocks, buildAcpPromptText } from '@/providers/acp/buildAcpPrompt';

describe('buildAcpPromptText', () => {
  it('appends current note and selection context to ACP provider prompts', () => {
    const prompt = buildAcpPromptText({
      currentNotePath: 'notes/current.md',
      editorSelection: {
        mode: 'selection',
        notePath: 'notes/current.md',
        selectedText: 'selected text',
        startLine: 2,
        lineCount: 1,
      },
      text: 'Translate this note',
    });

    expect(prompt).toContain('Translate this note');
    expect(prompt).toContain('<current_note>');
    expect(prompt).toContain('notes/current.md');
    expect(prompt).toContain('<editor_selection path="notes/current.md" lines="2-2">');
    expect(prompt).toContain('selected text');
  });

  it('rebuilds previous history when requested', () => {
    const prompt = buildAcpPromptText({ text: 'Continue' }, [
      { id: 'u1', role: 'user', content: 'First', timestamp: 1 },
      { id: 'a1', role: 'assistant', content: 'Second', timestamp: 2 },
    ]);

    expect(prompt).toContain('User: First');
    expect(prompt).toContain('Assistant: Second');
    expect(prompt).toContain('User: Continue');
  });
});

describe('buildAcpPromptBlocks', () => {
  it('includes images after the main text block', () => {
    expect(buildAcpPromptBlocks({
      text: 'Look',
      images: [{ id: 'img', mediaType: 'image/png', data: 'abc', name: 'a.png', size: 1, source: 'file' }],
    })).toEqual([
      { type: 'text', text: 'Look' },
      { type: 'image', mimeType: 'image/png', data: 'abc' },
    ]);
  });
});
