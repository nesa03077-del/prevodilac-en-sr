import { describe, expect, it } from 'vitest';
import { hasCyrillic, toLatin } from '../src/core/transliterate.js';

describe('toLatin', () => {
  it('preslovljava sva slova azbuke', () => {
    expect(toLatin('абвгдђежзијклљмнњопрстћуфхцчџш')).toBe('abvgdđežzijklljmnnjoprstćufhcčdžš');
    expect(toLatin('АБВГДЂЕЖЗИЈКЛМНОПРСТЋУФХЦЧШ')).toBe('ABVGDĐEŽZIJKLMNOPRSTĆUFHCČŠ');
  });

  it('pravilno piše velika dvoslovna slova', () => {
    expect(toLatin('Љубав')).toBe('Ljubav');
    expect(toLatin('Њујорк')).toBe('Njujork');
    expect(toLatin('Џеп')).toBe('Džep');
    expect(toLatin('ЉУБАВ')).toBe('LJUBAV');
    expect(toLatin('ЊЕГОШ')).toBe('NJEGOŠ');
    expect(toLatin('ЏЕП')).toBe('DŽEP');
    expect(toLatin('КЊ')).toBe('KNJ');
    expect(toLatin('Љ')).toBe('Lj');
  });

  it('ne dira latinicu, brojeve, interpunkciju i emoji', () => {
    const s = 'Dobar dan! Kako si? 3 km, 20% 👍';
    expect(toLatin(s)).toBe(s);
    expect(toLatin('Здраво, свете! 123 👍')).toBe('Zdravo, svete! 123 👍');
  });

  it('radi sa mešovitim tekstom i praznim ulazom', () => {
    expect(toLatin('Hello Београд')).toBe('Hello Beograd');
    expect(toLatin('')).toBe('');
    expect(hasCyrillic('abc')).toBe(false);
    expect(hasCyrillic('abв')).toBe(true);
  });
});
