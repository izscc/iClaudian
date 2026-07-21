import type { App, EventRef } from 'obsidian';
import { Notice, TFile } from 'obsidian';

import { formatVaultFileMention } from '../../shared/mention/formatMention';

interface FileMenuViewHost {
  appendToActiveInput(text: string): boolean;
}

export interface FileMenuActionHost {
  activateView(): Promise<void>;
  getView(): FileMenuViewHost | null;
}

export interface FileMenuHost extends FileMenuActionHost {
  readonly app: App;
  registerEvent(eventRef: EventRef): void;
}

export async function addFileToIClaudian(
  host: FileMenuActionHost,
  file: TFile,
): Promise<boolean> {
  try {
    await host.activateView();
    const appended = host.getView()?.appendToActiveInput(formatVaultFileMention(file.path)) ?? false;
    if (!appended) {
      new Notice('iClaudian chat is not ready.');
    }
    return appended;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    new Notice(`Failed to add file to iClaudian.${detail}`);
    return false;
  }
}

export function registerFileMenu(host: FileMenuHost): void {
  host.registerEvent(
    host.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile)) return;

      menu.addItem((item) => item
        .setTitle('Add to iClaudian')
        .setIcon('message-square-plus')
        .onClick(() => addFileToIClaudian(host, file)));
    }),
  );
}
