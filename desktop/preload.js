// Most između Electron-a i stranice (contextIsolation uključen): samo dve vrlo uske mogućnosti.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prevodilacDesktop', {
  platform: process.platform,
  /** Prečica Ctrl+Alt+L: pokreni/zaustavi prevođenje uživo. */
  onToggleLive: (cb) => ipcRenderer.on('prevodilac:toggle-live', () => cb()),
  /** Prozor je (ili više nije) iznad ostalih programa. */
  onAlwaysOnTop: (cb) => ipcRenderer.on('prevodilac:on-top', (_e, value) => cb(Boolean(value))),
});
