import { TFile } from 'obsidian';

import {
  addFileToIClaudian,
  type FileMenuActionHost,
} from '@/features/chat/fileMenu';

function createHost(appendResult = true): {
  readonly appendToActiveInput: jest.Mock<boolean, [string]>;
  readonly host: FileMenuActionHost;
} {
  const appendToActiveInput = jest.fn<boolean, [string]>(() => appendResult);
  const host: FileMenuActionHost = {
    activateView: jest.fn(async () => undefined),
    getView: () => ({ appendToActiveInput }),
  };
  return { appendToActiveInput, host };
}

describe('file menu', () => {
  it('opens iClaudian and appends a vault mention without sending', async () => {
    const { appendToActiveInput, host } = createHost();
    const file = new TFile();
    file.path = 'Projects/升级 计划.md';

    await expect(addFileToIClaudian(host, file))
      .resolves.toBe(true);

    expect(host.activateView).toHaveBeenCalledTimes(1);
    expect(appendToActiveInput).toHaveBeenCalledWith('@Projects/升级 计划.md ');
  });

  it('reports that the composer is unavailable', async () => {
    const { host } = createHost(false);
    const file = new TFile();
    file.path = 'Notes/a.md';

    await expect(addFileToIClaudian(host, file))
      .resolves.toBe(false);
  });
});
