import * as path from 'node:path';

import { readAcpTextFile } from '@/providers/acp/fsDelegate';

const FIXTURE = path.resolve(__dirname, 'fsDelegate.test.ts');

describe('readAcpTextFile', () => {
  it('reports missing files as empty content so agent write pre-checks succeed', async () => {
    await expect(readAcpTextFile('/nonexistent/iclaudian-missing-file.md', {}))
      .resolves.toEqual({ content: '' });
  });

  it('reads existing files verbatim', async () => {
    const { content } = await readAcpTextFile(FIXTURE, {});
    expect(content).toContain('readAcpTextFile');
  });

  it('slices by line and limit when requested', async () => {
    const { content } = await readAcpTextFile(FIXTURE, { line: 1, limit: 1 });
    expect(content).toBe("import * as path from 'node:path';");
  });

  it('still throws non-ENOENT errors', async () => {
    await expect(readAcpTextFile(path.dirname(FIXTURE), {})).rejects.toThrow();
  });
});
