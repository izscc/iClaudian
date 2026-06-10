import * as fs from 'node:fs/promises';

export interface AcpTextFileSlice {
  limit?: number | null;
  line?: number | null;
}

// gemini-cli probes write_file targets through fs/read_text_file and aborts the write on
// ANY error response — 0.45 maps neither -32603 nor the ACP resourceNotFound error back
// to "file does not exist" (verified against a live CLI). A missing file therefore has
// to read as empty content, or agents can never create new files through the client fs.
export async function readAcpTextFile(
  resolvedPath: string,
  request: AcpTextFileSlice,
): Promise<{ content: string }> {
  let content: string;
  try {
    content = await fs.readFile(resolvedPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { content: '' };
    }
    throw error;
  }

  if (request.line === undefined && request.limit === undefined) {
    return { content };
  }
  const lines = content.split(/\r?\n/);
  const startIndex = Math.max(0, (request.line ?? 1) - 1);
  const endIndex = request.limit ? startIndex + Math.max(0, request.limit) : lines.length;
  return { content: lines.slice(startIndex, endIndex).join('\n') };
}
