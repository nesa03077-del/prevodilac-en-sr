// Ekran za kucanje. Samo povezuje stranicu sa jezgrom (src/core); sva
// logika koja može da se testira nalazi se tamo.

import { describeDirection, oppositeMode } from '../core/direction.js';
import { resolveDirection } from '../core/detect.js';
import { createLiveSession } from '../core/live.js';
import { runDeviceChecks, summarizeChecks } from '../core/diagnostics.js';
import { DOMAINS } from '../core/domains.js';
import { createMetricsStore, describeMetrics } from '../core/metrics.js';
import { MODELS } from '../core/models.js';
import { REPORT_KINDS, createReportStore } from '../core/reports.js';
import {
  DEFAULT_SETTINGS,
  createSettingsStore,
  looksLikeApiKey,
  maskKey,
} from '../core/settings.js';
import { createClient, createTranslator } from '../core/translator.js';
import { initTalk } from './talk.js';

const $ = (id) => document.getElementById(id);

const el = {
  source: $('source'),
  output: $('output'),
  sourceLang: $('source-lang'),
  targetLang: $('target-lang'),
  autoTag: $('auto-tag'),
  clear: $('clear'),
  copy: $('copy'),
  swap: $('swap'),
  progress: $('progress'),
  notice: $('notice'),
  noticeText: $('notice-text'),
  noticeAction: $('notice-action'),
  settingsBtn: $('settings-btn'),
  dialog: $('settings'),
  form: $('settings-form'),
  apiKey: $('api-key'),
  keyHelp: $('key-help'),
  keyError: $('key-error'),
  modelList: $('model-list'),
  storageWarning: $('storage-warning'),
  forget: $('forget'),
  cancel: $('settings-cancel'),
  modeRadios: [...document.querySelectorAll('input[name="mode"]')],
  viewRadios: [...document.querySelectorAll('input[name="view"]')],
  typing: $('typing'),
  talkSlot: $('talk-slot'),
  net: $('net'),
  domainList: $('domain-list'),
  toast: $('toast'),
  checkBtn: $('device-check-btn'),
  checkSummary: $('device-summary'),
  checkResults: $('device-results'),
  metricsText: $('metrics-text'),
  metricsClear: $('metrics-clear'),
  reportsText: $('reports-text'),
  reportsExport: $('reports-export'),
  reportsClear: $('reports-clear'),
  reportDialog: $('report-dialog'),
  reportForm: $('report-form'),
  reportSource: $('report-source'),
  reportTranslation: $('report-translation'),
  reportKinds: $('report-kinds'),
  reportCorrection: $('report-correction'),
  reportNote: $('report-note'),
  reportCancel: $('report-cancel'),
};

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = createSettingsStore(getStorage());
const reportStore = createReportStore(getStorage());
const metricsStore = createMetricsStore(getStorage());
let settings = store.load();
let engine = null; // { session, translator } kad postoji ključ
let talk = null; // ekran razgovora (pravi se pri pokretanju)
let direction = { from: 'en', to: 'sr' };
let storageFailed = false;

// ---------- način rada: kucanje / razgovor ----------

function renderView() {
  for (const radio of el.viewRadios) radio.checked = radio.value === settings.view;
  el.typing.hidden = settings.view !== 'type';
  el.talkSlot.hidden = settings.view !== 'talk';
}

function setView(view) {
  if (view === settings.view) return;
  settings = { ...settings, view };
  if (!store.save(settings)) storageFailed = true;
  if (view !== 'talk' && !talk?.miniActive) talk?.stop();
  renderView();
  (view === 'type' ? el.source : null)?.focus();
}

for (const radio of el.viewRadios) {
  radio.addEventListener('change', () => {
    if (radio.checked) setView(radio.value);
  });
}

// Mikrofon se gasi čim stranica nije vidljiva.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) talk?.stop();
});

// ---------- kratka poruka (potvrda) ----------

let toastTimer = null;

function toast(text) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 3500);
}

// ---------- obaveštenja ----------

let noticeHandler = null;

function showNotice(text, { action = null, info = false } = {}) {
  el.noticeText.textContent = text;
  el.notice.classList.toggle('info', info);
  el.notice.setAttribute('role', info ? 'status' : 'alert');
  noticeHandler = action?.handler ?? null;
  el.noticeAction.hidden = !action;
  el.noticeAction.textContent = action?.label ?? '';
  el.notice.hidden = false;
}

function hideNotice() {
  el.notice.hidden = true;
  noticeHandler = null;
}

el.noticeAction.addEventListener('click', () => noticeHandler?.());

// ---------- natpisi i stanje ----------

const hasText = () => el.source.value.trim() !== '';

function renderLabels() {
  const d = describeDirection(settings.mode, direction, hasText());
  el.sourceLang.textContent = d.source;
  el.targetLang.textContent = d.target;
  el.autoTag.hidden = !(d.auto && hasText());
  el.clear.disabled = el.source.value === '';
}

function renderMode() {
  for (const radio of el.modeRadios) radio.checked = radio.value === settings.mode;
}

function setOutput(text) {
  el.output.textContent = text;
  el.output.dataset.empty = text ? 'false' : 'true';
  el.copy.disabled = !text;
}

// ---------- prevod ----------

function disposeEngine() {
  engine?.session.dispose();
  engine = null;
}

function buildEngine() {
  disposeEngine();
  if (!settings.apiKey) return;
  const translator = createTranslator({
    client: createClient(settings.apiKey),
    model: settings.model,
    domain: settings.domain,
  });
  const session = createLiveSession({
    translator,
    getMode: () => settings.mode,
    onUpdate: ({ source, translation, from, to, done }) => {
      setOutput(translation);
      if (source) direction = { from, to };
      renderLabels();
      if (done && translation) hideNotice();
    },
    onError: (err) => {
      setOutput('');
      const needsKey = err.code === 'auth' || err.code === 'permission';
      showNotice(err.message, needsKey ? { action: { label: 'Podešavanja', handler: openSettings } } : {});
    },
    onBusy: (busy) => {
      el.progress.hidden = !busy;
      el.output.setAttribute('aria-busy', String(busy));
    },
  });
  engine = { session, translator };
}

function showNoKeyNotice() {
  showNotice('Za prevod je potreban Anthropic API ključ.', {
    action: { label: 'Unesi ključ', handler: openSettings },
  });
}

function retranslateNow() {
  if (!engine) return;
  engine.session.reset();
  engine.session.flush(el.source.value);
}

// ---------- unos teksta ----------

el.source.addEventListener('input', () => {
  const text = el.source.value;
  direction = resolveDirection(settings.mode, text, direction);
  renderLabels();
  if (!engine) {
    setOutput('');
    if (text.trim()) showNoKeyNotice();
    return;
  }
  if (!el.notice.hidden && !el.notice.classList.contains('info')) hideNotice();
  if (text.trim() === '') engine.session.flush('');
  else engine.session.update(text);
});

el.source.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    engine?.session.flush(el.source.value);
  }
});

el.clear.addEventListener('click', () => {
  el.source.value = '';
  direction = resolveDirection(settings.mode, '', direction);
  renderLabels();
  hideNotice();
  if (engine) engine.session.flush('');
  else setOutput('');
  el.source.focus();
});

// ---------- smer ----------

function setMode(mode) {
  settings = { ...settings, mode };
  if (!store.save(settings)) storageFailed = true;
  renderMode();
  direction = resolveDirection(mode, el.source.value, direction);
  renderLabels();
}

for (const radio of el.modeRadios) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    setMode(radio.value);
    retranslateNow();
  });
}

el.swap.addEventListener('click', () => {
  const translated = el.output.textContent.trim();
  const next = oppositeMode(direction);
  setMode(next);
  if (translated) el.source.value = translated;
  direction = resolveDirection(next, el.source.value, direction);
  renderLabels();
  if (engine) {
    engine.session.reset();
    engine.session.flush(el.source.value);
  }
  el.source.focus();
});

// ---------- kopiranje ----------

let copyTimer = null;

function flashCopy(text) {
  el.copy.textContent = text;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (el.copy.textContent = 'Kopiraj'), 1600);
}

function selectOutputFallback() {
  const range = document.createRange();
  range.selectNodeContents(el.output);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

el.copy.addEventListener('click', async () => {
  const text = el.output.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flashCopy('Kopirano');
  } catch {
    flashCopy(selectOutputFallback() ? 'Kopirano' : 'Označeno, kopirajte ručno');
  }
});

// ---------- podešavanja ----------

function renderStats() {
  el.metricsText.textContent = describeMetrics(metricsStore.summary());
  el.metricsClear.disabled = metricsStore.list().length === 0;
  const n = reportStore.count;
  el.reportsText.textContent = n
    ? `Sačuvano prijava: ${n}. Izvezite ih i pošaljite programeru, da svaka postane novi test.`
    : 'Još nema prijava. Dugme "Prijavi grešku" je ispod svakog prevoda u razgovoru.';
  el.reportsExport.disabled = n === 0;
  el.reportsClear.disabled = n === 0;
}

const STATUS_LABELS = { ok: 'U redu', warn: 'Napomena', fail: 'Problem', info: 'Informacija' };

async function runCheck() {
  el.checkBtn.disabled = true;
  el.checkBtn.textContent = 'Proveravam…';
  el.checkResults.replaceChildren();
  el.checkSummary.hidden = true;
  try {
    const results = await runDeviceChecks({ getTranslator: () => engine?.translator ?? null });
    el.checkResults.replaceChildren(
      ...results.map((r) => {
        const li = document.createElement('li');
        li.className = `check-row ${r.status}`;
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = STATUS_LABELS[r.status];
        const box = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = r.label;
        const detail = document.createElement('span');
        detail.textContent = r.detail;
        box.append(title, detail);
        li.append(badge, box);
        return li;
      }),
    );
    el.checkSummary.textContent = summarizeChecks(results).text;
    el.checkSummary.hidden = false;
  } finally {
    el.checkBtn.disabled = false;
    el.checkBtn.textContent = 'Proveri ponovo';
  }
}

el.checkBtn.addEventListener('click', runCheck);

el.metricsClear.addEventListener('click', () => {
  metricsStore.clear();
  renderStats();
});

el.reportsClear.addEventListener('click', () => {
  reportStore.clear();
  renderStats();
});

el.reportsExport.addEventListener('click', () => {
  const blob = new Blob([reportStore.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prevodilac-prijave-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

// ---------- prijava greške u prevodu ----------

let reportItem = null;

function renderReportKinds() {
  el.reportKinds.replaceChildren(
    ...REPORT_KINDS.map((k, i) => {
      const label = radioCard({ name: 'report-kind', value: k.id, title: k.label, hint: '' });
      label.querySelector('span').remove();
      label.querySelector('input').checked = i === 0;
      return label;
    }),
  );
}

function openReport(item) {
  reportItem = item;
  el.reportSource.textContent = item.source;
  el.reportTranslation.textContent = item.translation;
  el.reportCorrection.value = '';
  el.reportNote.value = '';
  renderReportKinds();
  if (!el.reportDialog.open) el.reportDialog.showModal();
  el.reportCorrection.focus();
}

el.reportCancel.addEventListener('click', () => el.reportDialog.close());
el.reportDialog.addEventListener('click', (e) => {
  if (e.target === el.reportDialog) el.reportDialog.close();
});
el.reportForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!reportItem) return;
  const saved = reportStore.add({
    from: reportItem.from,
    to: reportItem.to,
    source: reportItem.source,
    translation: reportItem.translation,
    fixed: reportItem.fixed,
    domain: settings.domain,
    model: settings.model,
    kind: el.reportKinds.querySelector('input:checked')?.value,
    correction: el.reportCorrection.value,
    note: el.reportNote.value,
  });
  el.reportDialog.close();
  reportItem = null;
  toast(saved ? `Prijava je sačuvana (ukupno ${reportStore.count}).` : 'Prijava nije sačuvana: pregledač ne dozvoljava čuvanje.');
  renderStats();
});

let forgetArmed = false;

function radioCard({ name, value, title, hint }) {
  const label = document.createElement('label');
  label.className = 'model';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  const box = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = hint;
  box.append(strong, span);
  label.append(input, box);
  return label;
}

function renderDomainList() {
  el.domainList.replaceChildren(
    ...DOMAINS.map((d) => radioCard({ name: 'domain', value: d.id, title: d.label, hint: d.hint })),
  );
}

function renderModelList() {
  el.modelList.replaceChildren(
    ...MODELS.map((m) => {
      const label = document.createElement('label');
      label.className = 'model';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'model';
      input.value = m.id;
      const box = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = m.label;
      const hint = document.createElement('span');
      hint.textContent = m.hint;
      box.append(name, hint);
      label.append(input, box);
      return label;
    }),
  );
}

function resetForgetButton() {
  forgetArmed = false;
  el.forget.textContent = 'Obriši ključ i podešavanja';
}

function openSettings() {
  el.apiKey.value = '';
  el.apiKey.placeholder = settings.apiKey ? `Sačuvan: ${maskKey(settings.apiKey)}` : 'sk-ant-…';
  el.keyHelp.textContent = settings.apiKey
    ? 'Ostavite prazno da zadržite sačuvani ključ.'
    : 'Ključ se čuva samo u ovom pregledaču i šalje se samo na api.anthropic.com.';
  el.keyError.hidden = true;
  el.storageWarning.hidden = !storageFailed;
  for (const input of el.modelList.querySelectorAll('input')) input.checked = input.value === settings.model;
  for (const input of el.domainList.querySelectorAll('input')) input.checked = input.value === settings.domain;
  el.forget.hidden = !settings.apiKey;
  renderStats();
  resetForgetButton();
  if (!el.dialog.open) el.dialog.showModal();
  el.apiKey.focus();
}

function closeSettings() {
  if (el.dialog.open) el.dialog.close();
}

function applySettings(next) {
  settings = next;
  if (!store.save(settings)) storageFailed = true;
  renderMode();
  buildEngine();
  if (hasText()) retranslateNow();
}

el.settingsBtn.addEventListener('click', openSettings);
el.cancel.addEventListener('click', closeSettings);
el.dialog.addEventListener('click', (e) => {
  if (e.target === el.dialog) closeSettings();
});

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const typed = el.apiKey.value.trim();
  if (typed && !looksLikeApiKey(typed)) {
    el.keyError.textContent = 'Ovo ne liči na Anthropic ključ. Ključ počinje sa sk-ant-.';
    el.keyError.hidden = false;
    el.apiKey.focus();
    return;
  }
  if (!typed && !settings.apiKey) {
    el.keyError.textContent = 'Unesite API ključ da bi prevod radio.';
    el.keyError.hidden = false;
    el.apiKey.focus();
    return;
  }
  const model = el.modelList.querySelector('input:checked')?.value ?? settings.model;
  const domain = el.domainList.querySelector('input:checked')?.value ?? settings.domain;
  storageFailed = false;
  applySettings({ ...settings, apiKey: typed || settings.apiKey, model, domain });
  closeSettings();
  hideNotice();
  if (storageFailed) {
    showNotice('Pregledač ne dozvoljava čuvanje podešavanja. Važe samo dok je stranica otvorena.', { info: true });
  }
});

el.forget.addEventListener('click', () => {
  if (!forgetArmed) {
    forgetArmed = true;
    el.forget.textContent = 'Potvrdite brisanje';
    return;
  }
  store.clearAll();
  disposeEngine();
  talk?.stop();
  talk?.clear();
  settings = { ...DEFAULT_SETTINGS };
  renderView();
  talk?.refresh();
  renderMode();
  direction = resolveDirection('auto', el.source.value, direction);
  renderLabels();
  setOutput('');
  closeSettings();
  showNotice('Ključ i podešavanja su obrisani sa ovog uređaja.', { info: true });
});

// ---------- pokretanje ----------

renderDomainList();
renderModelList();
renderMode();
renderLabels();
setOutput('');
buildEngine();

talk = initTalk({
  getTranslator: () => engine?.translator ?? null,
  getSpeak: () => settings.speak,
  setSpeak: (value) => {
    settings = { ...settings, speak: value };
    if (!store.save(settings)) storageFailed = true;
  },
  onNeedKey: () => {
    showNoKeyNotice();
    openSettings();
  },
  onReport: openReport,
  onMetric: (m) => metricsStore.add(m),
});
renderView();

if (settings.apiKey) {
  if (settings.view === 'type') el.source.focus();
} else {
  showNoKeyNotice();
  openSettings();
}

// ---------- mreža ----------

function renderNet() {
  el.net.hidden = navigator.onLine !== false;
}
window.addEventListener('online', renderNet);
window.addEventListener('offline', renderNet);
renderNet();

// ---------- instalacija i rad bez mreže (PWA) ----------

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* bez servisnog radnika aplikacija radi, samo se ne učitava bez mreže */
    });
  });
}
