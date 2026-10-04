// Windows aplikacija: Electron omotač oko web verzije (../dist).
// Razlike u odnosu na pregledač:
//  - stranica se služi preko posebnog "app://" izvora (bezbedan kontekst, pa mikrofon radi bez HTTPS servera)
//  - zvuk poziva se hvata iz celog računara (loopback) bez biranja ekrana (Windows)
//  - prozor može da stoji iznad ostalih programa; prečica Ctrl+Alt+P uključuje/isključuje to,
//    a Ctrl+Alt+L pokreće/zaustavlja prevođenje uživo

const { app, BrowserWindow, Menu, desktopCapturer, globalShortcut, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SMOKE = process.argv.includes('--smoke');
const DIST = app.isPackaged ? path.join(process.resourcesPath, 'dist') : path.join(__dirname, '..', 'dist');
const ORIGIN = 'app://prevodilac';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;

function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.normalize(path.join(DIST, rel));
  return file.startsWith(DIST + path.sep) || file === DIST ? file : null; // ne izlazi iz dist/
}

function setupSession() {
  const ses = session.defaultSession;

  // Mikrofon dozvoljavamo samo našoj stranici; sve drugo se odbija.
  const ours = (wc) => Boolean(wc) && wc.getURL().startsWith(ORIGIN);
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(ours(wc) && ['media', 'speaker-selection'].includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => ours(wc) && ['media', 'speaker-selection'].includes(permission));

  // getDisplayMedia: zvuk celog računara (loopback), bez izbora ekrana. Video se odbacuje u stranici.
  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {});
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false },
  );

  protocol.handle('app', (request) => {
    const file = resolveFile(new URL(request.url).pathname);
    if (!file) return new Response('nema', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function toggleAlwaysOnTop() {
  if (!win) return;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'floating');
  win.webContents.send('prevodilac:on-top', next);
}

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 760,
    minWidth: 340,
    minHeight: 420,
    title: 'Prevodilac',
    backgroundColor: '#11161b',
    autoHideMenuBar: true,
    show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // prevođenje uživo mora da radi i kad prozor nije u prvom planu
    },
  });
  Menu.setApplicationMenu(null);

  // Spoljni linkovi se otvaraju u pregledaču, ne u aplikaciji.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) e.preventDefault();
  });

  win.loadURL(`${ORIGIN}/index.html`);
  win.on('closed', () => (win = null));
}

async function smokeTest() {
  const wc = win.webContents;
  await new Promise((resolve) => (wc.isLoading() ? wc.once('did-finish-load', resolve) : resolve()));
  const info = await wc.executeJavaScript(`(() => {
    const live = document.getElementById('live');
    return {
      title: document.title,
      secure: window.isSecureContext,
      origin: location.origin,
      hasLive: Boolean(live),
      jsRan: document.querySelectorAll('#model-list input').length > 0 && document.querySelectorAll('#phrase-list .phrase').length > 0,
      views: document.querySelectorAll('#view-group input').length,
      desktop: Boolean(window.prevodilacDesktop),
      getDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content.includes('speech.microsoft.com') ?? false,
    };
  })()`);
  console.log(`SMOKE ${JSON.stringify(info)}`);
  if (process.env.SMOKE_SHOT) {
    const image = await wc.capturePage();
    require('node:fs').writeFileSync(process.env.SMOKE_SHOT, image.toPNG());
  }
  app.exit(info.hasLive && info.jsRan && info.secure && info.desktop && info.views === 3 ? 0 : 1);
}

app.whenReady().then(() => {
  setupSession();
  createWindow();
  if (SMOKE) {
    smokeTest().catch((err) => {
      console.log(`SMOKE greška: ${err.message}`);
      app.exit(1);
    });
    return;
  }
  globalShortcut.register('Control+Alt+P', toggleAlwaysOnTop);
  globalShortcut.register('Control+Alt+L', () => win?.webContents.send('prevodilac:toggle-live'));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

// Jedna instanca: drugo pokretanje samo vraća postojeći prozor.
if (!app.requestSingleInstanceLock()) app.quit();
else
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
