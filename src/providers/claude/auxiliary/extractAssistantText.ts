export function extractAssistantText(
  message: { type: string; message?: unknown }
): string {
  if (message.type !== 'assistant') {
    return '';
  }
  const inner = message.message;
  const content =
    inner && typeof inner === 'object'
      ? (inner as { content?: unknown }).content
      : undefined;
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is { type: 'text'; text: string } =>
      !!block &&
      typeof block === 'object' &&
      'type' in block &&
      'text' in block &&
      block.type === 'text' &&
      typeof block.text === 'string'
    )
    .map((block) => block.text)
    .join('');
}
