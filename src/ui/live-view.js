// Ekran "Uživo": prevođenje bez pritiskanja dugmadi (probna verzija).
// Povezuje stranicu sa src/core/live-interpreter.js; sva logika je u jezgru.

import { LANG_LABELS } from '../core/direction.js';
import { describeNumberMismatch, splitByNumbers } from '../core/numbers.js';
import { createAudioPlayer } from '../core/audio-player.js';
import { createAzureRecognizer, createAzureSynthesizer, loadAzureSdk } from '../core/azure-speech.js';
import { createCapture } from '../core/audio-capture.js';
import { createInterpreter, describeLiveStatus } from '../core/live-interpreter.js';
import { createLiveVoice } from '../core/live-voice.js';
import { canCaptureSystemAudio, listOutputDevices, openLiveStreams } from '../core/media-streams.js';
import { createSpeaker, supportsSynthesis } from '../core/speaker.js';
import { createWakeLock } from './wakelock.js';

const $ = (id) => document.getElementById(id);

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
 *   getSettings: () => object,
 *   setSettings: (patch: object) => void,
 *   onNeedKey: () => void,
 *   onNeedAzure: () => void,
 *   onMetric?: (metric: object) => void,
 * }} options
 */
export function initLive({ getTranslator, getSettings, setSettings, onNeedKey, onNeedAzure, onMetric = () => {} }) {
  const el = {
    alert: $('live-alert'),
    status: $('live-status'),
    log: $('live-log'),
    start: $('live-start'),
    clear: $('live-clear'),
    myLang: [...document.querySelectorAll('input[name="live-my-lang"]')],
    mode: [...document.querySelectorAll('input[name="live-mode"]')],
    modeHelp: $('live-mode-help'),
    speakOther: $('live-speak-other'),
    speakMe: $('live-speak-me'),
    meters: { me: $('meter-me'), other: $('meter-other') },
    meterLabels: { me: $('meter-me-label'), other: $('meter-other-label') },
    output: $('live-output'),
    outputRow: $('live-output-row'),
  };

  const canSystem = canCaptureSystemAudio(navigator);
  const wake = createWakeLock();
  let sdkPromise = null;
  let synthesizer = null;
  let synthKey = '';

  const sdk = () => (sdkPromise ??= loadAzureSdk());
  const azureConfig = () => {
    const s = getSettings();
    return { key: s.azureKey, region: s.azureRegion };
  };

  // Glas: Azure neuralni, a ako ne uspe, glas pregledača.
  const player = createAudioPlayer();
  const browserSpeaker = supportsSynthesis(window)
    ? createSpeaker({ synth: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance })
    : null;
  const voice = createLiveVoice({
    synthesize: async (text, lang) => {
      const { key, region } = azureConfig();
      const id = `${key}|${region}`;
      if (!synthesizer || synthKey !== id) {
        synthesizer?.close();
        synthesizer = createAzureSynthesizer({ sdk: await sdk(), key, region });
        synthKey = id;
      }
      return synthesizer.synthesize(text, lang);
    },
    player,
    getOutputDevice: () => getSettings().outputDeviceId,
    fallback: browserSpeaker,
  });

  const interpreter = createInterpreter({
    getTranslator,
    getConfig: () => {
      const s = getSettings();
      return {
        myLang: s.liveMyLang,
        mode: canSystem ? s.liveMode : 'single-mic',
        speakToOther: s.liveSpeakToOther,
        speakToMe: s.liveSpeakToMe,
      };
    },
    openStreams: (mode) => openLiveStreams(mode),
    createCapture: (opts) => createCapture(opts),
    createRecognizer: (opts) => {
      // SDK se učitava tek pri pokretanju; start() ga čeka, pa se sve ostalo ne menja.
      let inner = null;
      const ready = sdk().then((loaded) => {
        const { key, region } = azureConfig();
        inner = createAzureRecognizer({ sdk: loaded, key, region, ...opts });
      });
      ready.catch(() => {}); // grešku prijavljuje start()
      return {
        start: async () => {
          await ready;
          return inner.start();
        },
        write: (pcm) => inner?.write(pcm),
        stop: async () => {
          await ready.catch(() => {});
          return inner?.stop();
        },
      };
    },
    speak: (text, lang, who) => voice.speak(text, lang, who),
    cancelSpeech: () => voice.cancel(),
    onChange: render,
    onMetric,
  });

  // ----- prikaz -----

  function turn(item, { live = false } = {}) {
    const li = document.createElement('li');
    li.className = `turn who-${item.who}${live ? ' live' : ''}`;
    li.dataset.status = item.status ?? 'live';

    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${item.who === 'me' ? 'Ja' : 'Sagovornik'} · ${LANG_LABELS[item.from]}`;

    const src = withNumbers('p', 'src', item.source);
    const tr = withNumbers('p', 'tr', item.translation || (item.status === 'error' ? '' : '…'));
    if (!item.translation) tr.classList.add('pending');
    li.append(who, src, tr);

    if (item.numbers?.checked && !item.numbers.ok) {
      const p = document.createElement('p');
      p.className = 'warn';
      p.textContent = describeNumberMismatch(item.numbers);
      li.append(p);
    }
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
    el.status.textContent = describeLiveStatus(state);
    showAlert(state);

    const running = state.phase !== 'idle';
    el.start.textContent = running ? 'Zaustavi' : 'Pokreni';
    el.start.classList.toggle('on', running);
    el.start.setAttribute('aria-pressed', String(running));
    el.start.disabled = state.phase === 'starting';
    // Podešavanja važe pri sledećem pokretanju.
    for (const input of [...el.myLang, ...el.mode, el.output]) input.disabled = running;

    if (running) wake.acquire();
    else wake.release();

    for (const who of ['me', 'other']) {
      el.meters[who].style.setProperty('--level', String(Math.min(1, state[who].level * 6)));
      el.meters[who].hidden = !running;
      el.meterLabels[who].hidden = !running;
    }

    const nearBottom = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 80;
    const nodes = state.items.map((i) => turn(i));
    for (const who of ['me', 'other']) {
      const lane = state[who];
      if (running && lane.interim) {
        const from = who === 'me' ? getSettings().liveMyLang : getSettings().liveMyLang === 'sr' ? 'en' : 'sr';
        nodes.push(
          turn({ who, from, source: lane.interim, translation: lane.interimTranslation, status: 'live' }, { live: true }),
        );
      }
    }
    el.log.replaceChildren(...nodes);
    el.log.dataset.empty = String(nodes.length === 0);
    el.clear.disabled = state.items.length === 0;
    if (nearBottom) el.log.scrollTop = el.log.scrollHeight;
  }

  // ----- podešavanja ekrana -----

  function renderControls() {
    const s = getSettings();
    for (const r of el.myLang) r.checked = r.value === s.liveMyLang;
    const mode = canSystem ? s.liveMode : 'single-mic';
    for (const r of el.mode) {
      r.checked = r.value === mode;
      if (r.value === 'two-streams') r.disabled = !canSystem || interpreter.getState().phase !== 'idle';
    }
    el.modeHelp.textContent =
      mode === 'two-streams'
        ? 'Moj mikrofon i zvuk poziva su odvojeni: svaka strana ima svoj jezik, pa nema pogađanja ko govori. Pri pokretanju izaberite ceo ekran (ili karticu) i uključite "Deli zvuk".'
        : canSystem
          ? 'Jedan mikrofon: sagovornik je na zvučniku, a jezik svake izjave određuje servis za govor.'
          : 'Ovaj uređaj hvata samo mikrofon: stavite sagovornika na zvučnik. Jezik svake izjave određuje servis za govor.';
    el.speakOther.checked = s.liveSpeakToOther;
    el.speakMe.checked = s.liveSpeakToMe;
    el.meterLabels.me.textContent = 'Moj glas';
    el.meterLabels.other.textContent = mode === 'two-streams' ? 'Zvuk poziva' : 'Isti mikrofon';
  }

  async function renderOutputs() {
    const devices = await listOutputDevices();
    const current = getSettings().outputDeviceId;
    const options = [new Option('Podrazumevani uređaj', '')];
    for (const d of devices) options.push(new Option(d.label, d.id));
    if (current && !devices.some((d) => d.id === current)) options.push(new Option('Sačuvani uređaj (nije povezan)', current));
    el.output.replaceChildren(...options);
    el.output.value = current;
    el.outputRow.hidden = typeof HTMLMediaElement === 'undefined' || !('setSinkId' in HTMLMediaElement.prototype);
  }

  for (const r of el.myLang) r.addEventListener('change', () => r.checked && setSettings({ liveMyLang: r.value }));
  for (const r of el.mode) {
    r.addEventListener('change', () => {
      if (r.checked) {
        setSettings({ liveMode: r.value });
        renderControls();
      }
    });
  }
  el.speakOther.addEventListener('change', () => setSettings({ liveSpeakToOther: el.speakOther.checked }));
  el.speakMe.addEventListener('change', () => setSettings({ liveSpeakToMe: el.speakMe.checked }));
  el.output.addEventListener('change', () => setSettings({ outputDeviceId: el.output.value }));

  el.start.addEventListener('click', () => {
    const phase = interpreter.getState().phase;
    if (phase === 'listening') {
      interpreter.stop();
      return;
    }
    if (phase !== 'idle') return;
    if (!getTranslator()) {
      onNeedKey();
      return;
    }
    if (!azureConfig().key) {
      onNeedAzure();
      return;
    }
    interpreter.start();
  });

  el.clear.addEventListener('click', () => interpreter.clear());
  el.alert.addEventListener('click', () => interpreter.dismissNotice());

  // Windows aplikacija: prečica Ctrl+Alt+L pokreće/zaustavlja prevođenje (samo dok je ovaj pogled prikazan).
  window.prevodilacDesktop?.onToggleLive(() => {
    if (!el.start.closest('[hidden]')) el.start.click();
  });

  renderControls();
  renderOutputs();
  render(interpreter.getState());

  return {
    stop: () => interpreter.stop(),
    clear: () => interpreter.clear(),
    get active() {
      return interpreter.getState().phase !== 'idle';
    },
    refresh() {
      renderControls();
      renderOutputs();
    },
  };
}
