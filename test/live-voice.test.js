import { describe, expect, it, vi } from 'vitest';
import { createLiveVoice } from '../src/core/live-voice.js';

function setup({ synthFails = false, played = { played: true }, fallback } = {}) {
  const player = { play: vi.fn(async () => played), stop: vi.fn() };
  const synthesize = vi.fn(async (text) => {
    if (synthFails) throw new Error('Azure ne radi');
    return new TextEncoder().encode(text).buffer;
  });
  const voice = createLiveVoice({ synthesize, player, getOutputDevice: () => 'kabl-1', fallback });
  return { voice, player, synthesize };
}

describe('createLiveVoice', () => {
  it('moj prevod za sagovornika ide na izabrani izlaz', async () => {
    const { voice, player, synthesize } = setup();
    expect(await voice.speak('Where are you?', 'en', 'me')).toEqual({ spoken: true });
    expect(synthesize).toHaveBeenCalledWith('Where are you?', 'en');
    expect(player.play.mock.calls[0][1]).toEqual({ sinkId: 'kabl-1' });
  });

  it('prevod za mene ide na podrazumevani izlaz', async () => {
    const { voice, player } = setup();
    await voice.speak('Gde si?', 'sr', 'other');
    expect(player.play.mock.calls[0][1]).toEqual({ sinkId: '' });
  });

  it('puštanje koje ne uspe javlja razlog', async () => {
    const { voice } = setup({ played: { played: false, reason: 'cancelled' } });
    expect(await voice.speak('x', 'en', 'me')).toEqual({ spoken: false, reason: 'cancelled' });
  });

  it('kad Azure glas ne uspe, koristi se glas pregledača', async () => {
    const fallback = { speak: vi.fn(async () => ({ spoken: true })), cancel: vi.fn() };
    const { voice, player } = setup({ synthFails: true, fallback });
    expect(await voice.speak('Zdravo', 'sr', 'other')).toEqual({ spoken: true });
    expect(fallback.speak).toHaveBeenCalledWith('Zdravo', 'sr');
    expect(player.play).not.toHaveBeenCalled();
  });

  it('bez rezervnog glasa greška se prijavljuje bez izuzetka', async () => {
    const { voice } = setup({ synthFails: true });
    expect(await voice.speak('x', 'en', 'me')).toEqual({ spoken: false, reason: 'error' });
  });

  it('cancel prekida oba', () => {
    const fallback = { speak: vi.fn(), cancel: vi.fn() };
    const { voice, player } = setup({ fallback });
    voice.cancel();
    expect(player.stop).toHaveBeenCalled();
    expect(fallback.cancel).toHaveBeenCalled();
  });
});
