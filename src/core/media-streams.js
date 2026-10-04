// Otvara zvuk za prevođenje uživo: moj mikrofon i, po želji, zvuk poziva.
// Zvuk poziva se hvata deljenjem ekrana ili kartice sa zvukom (Chrome/Edge na računaru;
// u Electron aplikaciji za Windows hvata se zvuk celog računara bez pitanja).

const coded = (code, cause) => Object.assign(new Error(code), { code, cause });

/** Greška getUserMedia -> naš kod. */
export function mapMicError(err) {
  return err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError' ? 'no-mic' : 'mic-denied';
}

/** Da li uređaj može da uhvati zvuk poziva (deljenje ekrana sa zvukom). */
export function canCaptureSystemAudio(nav = navigator) {
  return typeof nav?.mediaDevices?.getDisplayMedia === 'function';
}

const stopAll = (stream) => stream?.getTracks?.().forEach((t) => t.stop());

/**
 * @param {'two-streams'|'single-mic'} mode
 * @param {{ nav?: Navigator, StreamCtor?: typeof MediaStream, micDeviceId?: string }} [options]
 * @returns {Promise<{ mic: MediaStream, other: MediaStream|null, close: () => void, onEnded: (cb: () => void) => void }>}
 */
export async function openLiveStreams(mode, { nav = navigator, StreamCtor = globalThis.MediaStream, micDeviceId = '' } = {}) {
  if (!nav?.mediaDevices?.getUserMedia) throw coded('no-mic');

  let mic;
  try {
    mic = await nav.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {}) },
    });
  } catch (err) {
    throw coded(mapMicError(err), err);
  }

  let other = null;
  if (mode === 'two-streams') {
    if (!canCaptureSystemAudio(nav)) {
      stopAll(mic);
      throw coded('unsupported');
    }
    let display;
    try {
      // Video je obavezan za deljenje; odmah se odbacuje, a zvuk ostaje.
      display = await nav.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      stopAll(mic);
      throw coded(err?.name === 'NotAllowedError' || err?.name === 'AbortError' ? 'share-cancelled' : 'unsupported', err);
    }
    const audioTracks = display.getAudioTracks();
    for (const v of display.getVideoTracks()) v.stop();
    if (audioTracks.length === 0) {
      stopAll(mic);
      throw coded('no-system-audio');
    }
    other = new StreamCtor(audioTracks);
  }

  return {
    mic,
    other,
    close() {
      stopAll(mic);
      stopAll(other);
    },
    /** Javlja kad se zvuk prekine (npr. korisnik prestane da deli ekran ili izvuče mikrofon). */
    onEnded(cb) {
      for (const stream of [mic, other]) {
        for (const track of stream?.getAudioTracks?.() ?? []) track.addEventListener('ended', cb, { once: true });
      }
    },
  };
}

/** Lista izlaznih uređaja (zvučnici, slušalice, virtuelni kabl); prazna ako se ne može dobiti. */
export async function listOutputDevices(nav = navigator) {
  try {
    const devices = (await nav.mediaDevices?.enumerateDevices?.()) ?? [];
    return devices
      .filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Izlaz ${i + 1}` }));
  } catch {
    return [];
  }
}
