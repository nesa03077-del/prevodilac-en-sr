// Mali plutajući prozor koji stoji iznad ostalih programa (Document Picture-in-Picture,
// Chrome i Edge 116+ na računaru). Ekran razgovora se prebacuje u taj prozor, a u glavnom
// prozoru ostaje oznaka sa dugmetom "Vrati". Funkcije stranice (mikrofon, izgovor, prevod)
// i dalje rade u glavnom prozoru, pa ga ne treba zatvarati.

export function supportsMiniWindow(win = window) {
  return Boolean(win && 'documentPictureInPicture' in win);
}

/**
 * @param {{
 *   element: HTMLElement,
 *   onChange?: (active: boolean) => void,
 *   onOpen?: (miniWindow: Window) => void,
 *   title?: string,
 *   width?: number,
 *   height?: number,
 * }} options
 */
export function createMiniWindow({ element, onChange = () => {}, onOpen = () => {}, title = 'Prevodilac', width = 400, height = 620 }) {
  let mini = null;
  let placeholder = null;

  function restore() {
    if (!mini) return;
    mini = null;
    if (placeholder) {
      placeholder.replaceWith(element); // element se vraća u glavni dokument
      placeholder = null;
    }
    onChange(false);
  }

  function makePlaceholder() {
    const box = document.createElement('div');
    box.className = 'mini-placeholder';
    const text = document.createElement('p');
    text.textContent = 'Razgovor je u malom prozoru koji stoji iznad ostalih programa.';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ghost';
    back.textContent = 'Vrati ovde';
    back.addEventListener('click', () => close());
    box.append(text, back);
    return box;
  }

  async function open() {
    if (mini) {
      mini.focus?.();
      return;
    }
    const win = await window.documentPictureInPicture.requestWindow({ width, height });

    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const copy = win.document.createElement('link');
      copy.rel = 'stylesheet';
      copy.href = link.href;
      win.document.head.append(copy);
    }
    const scheme = win.document.createElement('meta');
    scheme.name = 'color-scheme';
    scheme.content = 'light dark';
    win.document.head.append(scheme);
    win.document.title = title;
    win.document.documentElement.lang = document.documentElement.lang;
    win.document.documentElement.classList.add('mini');

    const host = win.document.createElement('div');
    host.className = 'app';
    win.document.body.append(host);

    placeholder = makePlaceholder();
    element.before(placeholder);
    host.append(element);

    mini = win;
    win.addEventListener('pagehide', restore, { once: true });
    onOpen(win);
    onChange(true);
  }

  function close() {
    const win = mini;
    if (!win) return;
    restore();
    try {
      win.close();
    } catch {
      /* već zatvoren */
    }
  }

  return {
    open,
    close,
    get active() {
      return mini !== null;
    },
  };
}
