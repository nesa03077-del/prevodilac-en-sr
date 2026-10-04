// Ekran razgovora govorom. Povezuje stranicu sa src/core/conversation.js.

import { LANG_LABELS } from '../core/direction.js';
import { createConversation, describeStatus } from '../core/conversation.js';
import { createSpeaker, supportsSynthesis } from '../core/speaker.js';
import { createRecognizer, getSpeechRecognitionCtor } from '../core/speech-recognizer.js';

const $ = (id) => document.getElementById(id);

export const UNSUPPORTED_MESSAGE =
  'Ovaj pregledač ne podržava prepoznavanje govora. Probajte Chrome ili Edge. Kucanje radi u svakom pregledaču.';

/**
 * @param {{
 *   getTranslator: () => ({ translate: Function } | null),
 *   getSpeak: () => boolean,
 *   setSpeak: (value: boolean) => void,
 *   onNeedKey: () => void,
 * }} options
 */
export function initTalk({ getTranslator, getSpeak, setSpeak, onNeedKey }) {
  const el = {
    unsupported: $('talk-unsupported'),
    alert: $('talk-alert'),
    status: $('talk-status'),
    log: $('talk-log'),
    buttons: [...document.querySelectorAll('.talk-btn')],
    speak: $('speak-toggle'),
    clear: $('talk-clear'),
  };

  const Ctor = getSpeechRecognitionCtor(window);
  const canSpeak = supportsSynthesis(window);

  function turn(item, { live = false } = {}) {
    const li = document.createElement('li');
    li.className = `turn from-${item.from}${live ? ' live' : ''}`;
    li.dataset.status = item.status ?? 'live';

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = LANG_LABELS[item.from];

    const src = document.createElement('p');
    src.className = 'src';
    src.textContent = item.source;

    const tr = document.createElement('p');
    tr.className = 'tr';
    tr.textContent = item.translation || (item.status === 'error' ? '' : '…');
    if (!item.translation) tr.classList.add('pending');

    li.append(who, src, tr);
    if (item.error) {
      const err = document.createElement('p');
      err.className = 'err';
      err.textContent = item.error;
      li.append(err);
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

  // ----- bez podrške za govor -----
  if (!Ctor) {
    el.unsupported.textContent = UNSUPPORTED_MESSAGE;
    el.unsupported.hidden = false;
    for (const btn of el.buttons) btn.disabled = true;
    el.speak.disabled = true;
    el.speak.checked = false;
    el.log.dataset.empty = 'true';
    return { supported: false, stop() {}, clear() {}, refresh() {} };
  }

  const conv = createConversation({
    getTranslator,
    createRecognizer: (handlers) => createRecognizer({ Ctor, ...handlers }),
    speaker: canSpeak
      ? createSpeaker({ synth: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance })
      : null,
    getSpeak: () => getSpeak(),
    onChange: render,
  });

  for (const btn of el.buttons) {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (conv.getState().listening === lang) {
        conv.stopListening();
        return;
      }
      if (!getTranslator()) {
        onNeedKey();
        return;
      }
      conv.startListening(lang);
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
    stop: () => conv.stopListening(),
    clear: () => conv.clear(),
    refresh: () => {
      el.speak.checked = canSpeak && getSpeak();
    },
  };
}
