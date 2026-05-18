import { normalizeLogLine } from '../../src/browser/log-channel';
import { LOG_IPC_CHANNEL } from '../../src/logger';

// Ticket #04 phase 04c — renderer→main log IPC channel.
//
// The end-to-end forwarding (renderer ipcRenderer.send → main ipcMain.on →
// disk) is exercised by a runtime smoke test; here we cover the contract
// pieces that are unit-testable: the shared channel name and the line
// normalization that keeps the on-disk file newline-delimited JSON.
describe('ipc-log-channel', () => {
  it('shares one stable IPC channel name between renderer and main', () => {
    expect(LOG_IPC_CHANNEL).toEqual('actuna-log');
  });

  describe('normalizeLogLine', () => {
    it('appends a trailing newline when one is missing', () => {
      expect(normalizeLogLine('{"level":30,"msg":"hi"}')).toEqual('{"level":30,"msg":"hi"}\n');
    });

    it('leaves an already-terminated line unchanged', () => {
      expect(normalizeLogLine('{"level":30}\n')).toEqual('{"level":30}\n');
    });
  });
});
