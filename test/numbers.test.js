import { describe, expect, it } from 'vitest';
import { compareNumbers, describeNumberMismatch, extractNumbers, splitByNumbers } from '../src/core/numbers.js';

describe('extractNumbers', () => {
  it('izvlači grupe cifara i ignoriše razdvajanje', () => {
    expect(extractNumbers('Load 48213 at 14:30').map((n) => n.digits)).toEqual(['48213', '1430']);
    expect(extractNumbers('43,500 lbs').map((n) => n.digits)).toEqual(['43500']);
    expect(extractNumbers('call 555-123-4567').map((n) => n.digits)).toEqual(['5551234567']);
    expect(extractNumbers('I-80 exit 112').map((n) => n.digits)).toEqual(['80', '112']);
  });

  it('nema cifara: prazan niz', () => {
    expect(extractNumbers('no numbers here')).toEqual([]);
    expect(extractNumbers(null)).toEqual([]);
    expect(extractNumbers('')).toEqual([]);
  });

  it('čuva vodeće nule (ZIP kodovi)', () => {
    expect(extractNumbers('ZIP 07030')[0].digits).toBe('07030');
  });
});

describe('compareNumbers', () => {
  it('isti brojevi: u redu', () => {
    expect(compareNumbers('Pick up load 48213 at 14:30', 'Pokupi tovar 48213 u 14:30')).toEqual({
      checked: true, ok: true, missing: [], extra: [],
    });
  });

  it('različito zapisivanje istog broja nije greška', () => {
    expect(compareNumbers('The weight is 43,500 lbs', 'Težina je 43.500 lbs').ok).toBe(true);
    expect(compareNumbers('at 14:30', 'u 14.30').ok).toBe(true);
    expect(compareNumbers('call 555-123-4567', 'pozovi 555 123 4567').ok).toBe(true);
    expect(compareNumbers('temperature 34.5', 'temperatura 34,5').ok).toBe(true);
  });

  it('promenjen red reči nije greška', () => {
    expect(compareNumbers('load 123 in Dallas at 14:30', 'u 14:30 u Dallasu, tovar 123').ok).toBe(true);
  });

  it('promenjena cifra se hvata', () => {
    const r = compareNumbers('Load 48213 at 14:30', 'Tovar 48231 u 14:30');
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['48213']);
    expect(r.extra).toEqual(['48231']);
  });

  it('izgubljen broj se hvata', () => {
    const r = compareNumbers('Exit 112 on I-80', 'Izlaz na I-80');
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['112']);
  });

  it('dodat broj se hvata', () => {
    const r = compareNumbers('You have 9 hours left', 'Imaš 9 sati, 15 minuta');
    expect(r.ok).toBe(false);
    expect(r.extra).toEqual(['15']);
  });

  it('dva ista broja moraju oba da postoje', () => {
    expect(compareNumbers('Truck 22 and trailer 22', 'Kamion 22 i prikolica 22').ok).toBe(true);
    expect(compareNumbers('Truck 22 and trailer 22', 'Kamion 22 i prikolica').ok).toBe(false);
  });

  it('bez cifara u izvoru ne proverava (brojevi rečima)', () => {
    expect(compareNumbers('fifteen hours', '15 sati')).toEqual({ checked: false, ok: true, missing: [], extra: [] });
    expect(compareNumbers('', '')).toMatchObject({ checked: false, ok: true });
  });
});

describe('splitByNumbers', () => {
  it('deli tekst na brojeve i ostalo', () => {
    expect(splitByNumbers('Load 48213 at 14:30 ok')).toEqual([
      { text: 'Load ', number: false },
      { text: '48213', number: true },
      { text: ' at ', number: false },
      { text: '14:30', number: true },
      { text: ' ok', number: false },
    ]);
  });

  it('spojeni delovi daju isti tekst', () => {
    const t = 'Call 555-123-4567, exit 112, 114.';
    expect(splitByNumbers(t).map((p) => p.text).join('')).toBe(t);
  });

  it('tekst bez brojeva i prazan tekst', () => {
    expect(splitByNumbers('nema')).toEqual([{ text: 'nema', number: false }]);
    expect(splitByNumbers('')).toEqual([]);
  });
});

describe('describeNumberMismatch', () => {
  it('navodi šta nedostaje i šta je višak', () => {
    const msg = describeNumberMismatch(compareNumbers('Load 48213 at 14:30', 'Tovar 48231 u 14:30'));
    expect(msg).toContain('nedostaje u prevodu: 48213');
    expect(msg).toContain('višak u prevodu: 48231');
    expect(msg).toContain('oslonite na prevod');
  });

  it('samo nedostaje ili samo višak', () => {
    expect(describeNumberMismatch(compareNumbers('Exit 112', 'Izlaz'))).not.toContain('višak');
    expect(describeNumberMismatch(compareNumbers('Exit 112', 'Izlaz 112 i 113'))).not.toContain('nedostaje');
  });
});
