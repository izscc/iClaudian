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

  it('explains the current note tag for agents that receive no system prompt', () => {
    const prompt = buildAcpPromptText({
      currentNotePath: 'notes/current.md',
      text: '翻译',
    });

    const tagIndex = prompt.indexOf('<current_note>');
    const explanationIndex = prompt.indexOf('currently open in Obsidian');
    expect(explanationIndex).toBeGreaterThan(tagIndex);
    expect(prompt).toContain('refers to that note');
  });

  it('adds strict external context scope instructions for ACP providers', () => {
    const prompt = buildAcpPromptText({
      externalContextPaths: [
        '/Users/zscc.in/Desktop/船仓文件/Obsidian/OB/00-资料库/📄 素材库',
      ],
      text: '翻译这个文件夹里的内容',
    });

    expect(prompt).toContain('<external_context_paths>');
    expect(prompt).toContain('/Users/zscc.in/Desktop/船仓文件/Obsidian/OB/00-资料库/📄 素材库');
    expect(prompt).toContain('Do not search outside these paths');
  });

  it('adds no tag explanation when there is no current note', () => {
    const prompt = buildAcpPromptText({ text: 'hello' });

    expect(prompt).toBe('hello');
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

  it('caps inlined history to a recent bounded window and marks the truncation', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `message ${i} ${'x'.repeat(2000)}`,
      timestamp: i,
    }));

    const prompt = buildAcpPromptText({ text: 'Continue' }, history);

    expect(prompt.length).toBeLessThan(30_000);
    expect(prompt).toContain('message 39');
    expect(prompt).not.toContain('message 0 ');
    expect(prompt).toContain('omitted');
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

  it('links the current note as a file resource when a base dir is provided', () => {
    const blocks = buildAcpPromptBlocks(
      { text: '翻译', currentNotePath: '00-资料库/📄 素材库/note.md' },
      [],
      { fileResourceBaseDir: '/vault/root' },
    );

    expect(blocks).toContainEqual({
      name: 'note.md',
      type: 'resource_link',
      uri: 'file:///vault/root/00-资料库/📄 素材库/note.md',
    });
  });

  it('emits no resource link without a base dir', () => {
    const blocks = buildAcpPromptBlocks({ text: '翻译', currentNotePath: 'note.md' });

    expect(blocks.some(block => block.type === 'resource_link')).toBe(false);
  });
});
