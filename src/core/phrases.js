// Unapred proverene fraze dispečera: pritisak izgovara srpski tekst odmah, bez mreže
// i bez mogućnosti greške prevoda. Tekst je na srpskom latinicom, kako vozači govore
// (engleski stručni izrazi ostaju na engleskom).
//
// NAPOMENA: fraze treba da pregleda maternji govornik srpskog koji vozi u SAD,
// pre nego što se osloni na njih u pravom poslu.

export const PHRASE_GROUPS = [
  { id: 'status', label: 'Lokacija i stanje' },
  { id: 'dock', label: 'Utovar i istovar' },
  { id: 'hours', label: 'Sati i pauza' },
  { id: 'docs', label: 'Dokumenta' },
  { id: 'general', label: 'Opšte' },
];

export const PHRASES = [
  // Lokacija i stanje
  { id: 'where', group: 'status', en: 'Where are you right now?', sr: 'Gde si sada?' },
  { id: 'eta', group: 'status', en: 'What is your ETA?', sr: 'Koji ti je ETA?' },
  { id: 'loaded', group: 'status', en: 'Are you loaded or empty?', sr: 'Jesi li utovaren ili prazan?' },
  { id: 'moving', group: 'status', en: 'Are you moving or parked?', sr: 'Voziš li ili stojiš?' },
  { id: 'okay', group: 'status', en: 'Are you okay? Was there an accident?', sr: 'Jesi li dobro? Da li je bilo udesa?' },
  { id: 'roadside', group: 'status', en: 'Is the truck okay? Do you need roadside help?', sr: 'Je li kamion u redu? Treba li ti roadside?' },
  { id: 'late', group: 'status', en: 'Are you going to be late?', sr: 'Da li ćeš kasniti?' },
  { id: 'traffic', group: 'status', en: 'How are the traffic and the weather on your route?', sr: 'Kakav je saobraćaj i vreme na tvojoj ruti?' },

  // Utovar i istovar
  { id: 'at-shipper', group: 'dock', en: 'Are you at the shipper yet?', sr: 'Jesi li već kod shippera?' },
  { id: 'loaded-yet', group: 'dock', en: 'Did they load you yet?', sr: 'Jesu li te već utovarili?' },
  { id: 'at-receiver', group: 'dock', en: 'Are you at the receiver yet?', sr: 'Jesi li već kod receivera?' },
  { id: 'unloaded-yet', group: 'dock', en: 'Did they unload you yet?', sr: 'Jesu li te već istovarili?' },
  { id: 'waiting', group: 'dock', en: 'How long have you been waiting?', sr: 'Koliko dugo čekaš?' },
  { id: 'detention', group: 'dock', en: 'I will request detention from the broker.', sr: 'Tražiću detention od brokera.' },
  { id: 'check-in', group: 'dock', en: 'Check in at the front office and ask for your dock number.', sr: 'Prijavi se u kancelariji i pitaj za broj doka.' },

  // Sati i pauza
  { id: 'hours-left', group: 'hours', en: 'How many hours do you have left?', sr: 'Koliko ti je sati ostalo?' },
  { id: 'break-10', group: 'hours', en: 'You need to take your 10 hour break.', sr: 'Moraš da uzmeš pauzu od 10 sati.' },

  // Dokumenta
  { id: 'load-number', group: 'docs', en: 'What is the load number?', sr: 'Koji je load number?' },
  { id: 'bol', group: 'docs', en: 'Send me a picture of the BOL.', sr: 'Pošalji mi sliku BOL-a.' },
  { id: 'pod', group: 'docs', en: 'Send me the POD after delivery.', sr: 'Pošalji mi POD posle istovara.' },
  { id: 'ratecon', group: 'docs', en: 'I will send you the rate confirmation.', sr: 'Poslaću ti rate confirmation.' },
  { id: 'seal', group: 'docs', en: 'Check that the seal number matches the BOL.', sr: 'Proveri da seal number odgovara BOL-u.' },

  // Opšte
  { id: 'repeat', group: 'general', en: 'Please repeat that.', sr: 'Molim te, ponovi.' },
  { id: 'slow', group: 'general', en: 'Please speak slowly.', sr: 'Molim te, govori sporije.' },
  { id: 'not-understood', group: 'general', en: 'I did not understand. Say it again.', sr: 'Nisam razumeo. Reci ponovo.' },
  { id: 'wait', group: 'general', en: 'Wait one moment, please.', sr: 'Sačekaj trenutak, molim te.' },
  { id: 'call-me', group: 'general', en: 'Call me when you arrive.', sr: 'Javi mi se kad stigneš.' },
  { id: 'text', group: 'general', en: 'I will text you the details.', sr: 'Poslaću ti detalje porukom.' },
  { id: 'confirm', group: 'general', en: 'Confirm: do you understand?', sr: 'Potvrdi: jesi li razumeo?' },
  { id: 'thanks', group: 'general', en: 'Thank you. Drive safe.', sr: 'Hvala. Vozi oprezno.' },
];

export const getPhrase = (id) => PHRASES.find((p) => p.id === id) ?? null;
