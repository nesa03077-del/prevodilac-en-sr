// Ekran razgovora govorom (dispečerski režim). Povezuje stranicu sa src/core/conversation.js.

import { LANG_LABELS } from '../core/direction.js';
import { createConversation, describeStatus } from '../core/conversation.js';
import { describeNumberMismatch, splitByNumbers } from '../core/numbers.js';
import { PHRASES, PHRASE_GROUPS, getPhrase } from '../core/phrases.js';
import { createSpeaker, supportsSynthesis } from '../core/speaker.js';
import { createRecognizer, getSpeechRecognitionCtor } from '../core/speech-recognizer.js';
import { createMiniWindow, supportsMiniWindow } from './mini-window.js';
import { createWakeLock } from './wakelock.js';

const $ = (id) => document.getElementById(id);

export const UNSUPPORTED_MESSAGE =
  'Ovaj pregledač ne podržava prepoznavanje govora. Probajte Chrome ili Edge. Kucanje radi u svakom pregledaču.';

/** Tekst sa istaknutim brojevima (da se cifre vide na prvi pogled). */
function withNumbers(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  for (const part of splitByNumbers(text)) {
    if (part.number) {
      const mark = document.createElement('mark');
      mark.className = 'num';
      mark.textContent = part.text;
      node.append(mark);
    } else {
      node.append(part.text);
    }
  }
  return node;
}

/**
 * @param {{
 *   getTranslator: () => ({ translate: Function } | null),
 *   getSpeak: () => boolean,
 *   setSpeak: (value: boolean) => void,
 *   onNeedKey: () => void,
 *   onMiniChange?: (active: boolean) => void,
 * }} options
 */
export function initTalk({ getTranslator, getSpeak, setSpeak, onNeedKey, onMiniChange = () => {} }) {
  const el = {
    root: $('talking'),
    unsupported: $('talk-unsupported'),
    alert: $('talk-alert'),
    status: $('talk-status'),
    log: $('talk-log'),
    buttons: [...document.querySelectorAll('.talk-btn')],
    speak: $('speak-toggle'),
    clear: $('talk-clear'),
    phrases: $('phrases'),
    phraseList: $('phrase-list'),
    mini: $('mini-btn'),
  };

  const Ctor = getSpeechRecognitionCtor(window);
  const canSpeak = supportsSynthesis(window);
  const wake = createWakeLock();
  let conv = null;

  // ----- stavke razgovora -----

  function warning(text) {
    const p = document.createElement('p');
    p.className = 'warn';
    p.textContent = text;
    return p;
  }

  function turn(item, { live = false } = {}) {
    const li = document.createElement('li');
    li.className = `turn from-${item.from}${live ? ' live' : ''}${item.fixed ? ' fixed' : ''}`;
    li.dataset.status = item.status ?? 'live';

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = item.fixed ? 'Gotova fraza' : LANG_LABELS[item.from];

    const src = withNumbers('p', 'src', item.source);
    const tr = withNumbers('p', 'tr', item.translation || (item.status === 'error' ? '' : '…'));
    if (!item.translation) tr.classList.add('pending');

    li.append(who, src, tr);

    if (item.numbers?.checked && !item.numbers.ok) li.append(warning(describeNumberMismatch(item.numbers)));
    if (item.error) {
      const err = document.createElement('p');
      err.className = 'err';
      err.textContent = item.error;
      li.append(err);
    }

    // Provera prevodom nazad
    if (item.status === 'done' && !item.fixed && !live) {
      if (!item.check) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'verify ghost small';
        btn.dataset.id = String(item.id);
        btn.textContent = 'Proveri prevodom nazad';
        li.append(btn);
      } else if (item.check.status === 'translating') {
        const p = document.createElement('p');
        p.className = 'check pending';
        p.textContent = 'Proveravam…';
        li.append(p);
      } else if (item.check.status === 'error') {
        li.append(warning(`Provera nije uspela: ${item.check.error}`));
      } else {
        const box = document.createElement('div');
        box.className = 'check';
        const label = document.createElement('span');
        label.className = 'who';
        label.textContent = `Prevod nazad (${LANG_LABELS[item.from]})`;
        box.append(label, withNumbers('p', 'back', item.check.text));
        if (item.check.numbers?.checked && !item.check.numbers.ok) {
          box.append(warning(describeNumberMismatch(item.check.numbers)));
        }
        li.append(box);
      }
    }
    return li;
  }

  function showAlert(state) {
    const msg = state.error?.message ?? state.notice;
    el.alert.hidden = !msg;
    el.alert.textContent = msg ?? '';
    const info = !state.error && Boolean(state.notice);
    el.alert.classList.toggle('info', info);
    el.alert.setAttribute('role', info ? 'status' : 'alert');
  }

  function render(state) {
    el.status.textContent = describeStatus(state);
    showAlert(state);

    for (const btn of el.buttons) {
      const active = state.listening === btn.dataset.lang;
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('on', active);
      btn.classList.toggle('paused', active && state.phase === 'paused');
    }

    if (state.listening) wake.acquire();
    else wake.release();

    const nearBottom = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 80;
    const nodes = state.items.map((i) => turn(i));
    if (state.listening && state.interim) {
      nodes.push(
        turn(
          { from: state.listening, source: state.interim, translation: state.interimTranslation, status: 'live' },
          { live: true },
        ),
      );
    }
    el.log.replaceChildren(...nodes);
    el.log.dataset.empty = String(nodes.length === 0);
    el.clear.disabled = state.items.length === 0;
    if (nearBottom) el.log.scrollTop = el.log.scrollHeight;
  }

  // ----- brze fraze -----

  function renderPhrases() {
    const groups = PHRASE_GROUPS.map((g) => {
      const box = document.createElement('div');
      box.className = 'phrase-group';
      const title = document.createElement('h3');
      title.textContent = g.label;
      const row = document.createElement('div');
      row.className = 'phrase-row';
      for (const p of PHRASES.filter((x) => x.group === g.id)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'phrase';
        btn.dataset.phrase = p.id;
        btn.title = p.sr;
        const en = document.createElement('span');
        en.textContent = p.en;
        const sr = document.createElement('small');
        sr.textContent = p.sr;
        btn.append(en, sr);
        row.append(btn);
      }
      box.append(title, row);
      return box;
    });
    el.phraseList.replaceChildren(...groups);
  }

  renderPhrases();

  el.phraseList.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.phrase');
    if (!btn || !conv) return;
    conv.addPhrase(getPhrase(btn.dataset.phrase));
  });

  // ----- bez podrške za govor -----
  if (!Ctor) {
    el.unsupported.textContent = UNSUPPORTED_MESSAGE;
    el.unsupported.hidden = false;
    for (const btn of el.buttons) btn.disabled = true;
    el.phrases.hidden = true;
    el.speak.disabled = true;
    el.speak.checked = false;
    el.log.dataset.empty = 'true';
    return { supported: false, miniActive: false, stop() {}, clear() {}, refresh() {} };
  }

  conv = createConversation({
    getTranslator,
    createRecognizer: (handlers) => createRecognizer({ Ctor, ...handlers }),
    speaker: canSpeak
      ? createSpeaker({ synth: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance })
      : null,
    getSpeak: () => getSpeak(),
    onChange: render,
  });

  function toggleSpeaker(lang) {
    if (conv.getState().listening === lang) {
      conv.stopListening();
      return;
    }
    if (!getTranslator()) {
      onNeedKey();
      return;
    }
    conv.startListening(lang);
  }

  for (const btn of el.buttons) btn.addEventListener('click', () => toggleSpeaker(btn.dataset.lang));

  el.log.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button.verify');
    if (btn) conv.verify(Number(btn.dataset.id));
  });

  // ----- prečice: 1 = engleski govori, 2 = srpski govori, Esc = stop -----
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (el.root.closest('[hidden]') && !mini.active) return; // razgovor nije prikazan
    if (e.key === '1') toggleSpeaker('en');
    else if (e.key === '2') toggleSpeaker('sr');
    else if (e.key === 'Escape') conv.stopListening();
    else return;
    e.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  // ----- mali prozor -----
  const mini = createMiniWindow({
    element: el.root,
    onOpen: (win) => win.document.addEventListener('keydown', onKey),
    onChange: (active) => {
      el.mini.textContent = active ? 'Vrati ovde' : 'Mali prozor';
      el.phrases.open = !active; // u malom prozoru fraze su zatvorene da ostane mesta
      onMiniChange(active);
    },
  });

  if (supportsMiniWindow()) {
    el.mini.hidden = false;
    el.mini.addEventListener('click', async () => {
      if (mini.active) {
        mini.close();
        return;
      }
      try {
        await mini.open();
      } catch {
        el.alert.textContent = 'Mali prozor nije mogao da se otvori. Probajte ponovo.';
        el.alert.hidden = false;
      }
    });
  }

  el.speak.disabled = !canSpeak;
  el.speak.checked = canSpeak && getSpeak();
  if (!canSpeak) el.speak.title = 'Ovaj pregledač ne podržava izgovor.';
  el.speak.addEventListener('change', () => setSpeak(el.speak.checked));

  el.clear.addEventListener('click', () => conv.clear());
  el.alert.addEventListener('click', () => conv.dismissNotice());

  render(conv.getState());

  return {
    supported: true,
    get miniActive() {
      return mini.active;
    },
    stop: () => conv.stopListening(),
    clear: () => conv.clear(),
    refresh: () => {
      el.speak.checked = canSpeak && getSpeak();
    },
  };
}
