/**
 * Sunny's zero-token commands: short playful requests ("raqsga tush", "salto qil", "uxlab qol"…) are recognised here, in
 * the browser, and answered by the robot's own animations and a short line — no AI call. Only a whole short message
 * counts, so a real question that happens to contain one of these words still goes to the assistant. Pure functions.
 */

export type LocalAct = 'dance' | 'salto' | 'angry' | 'sleep' | 'happy' | 'chase' | 'wave' | 'peace' | 'stop';
export type LocalIntent = { act: LocalAct; reply: string };

/** Lower case, Uzbek apostrophes unified, punctuation and the robot's name (however it was heard) removed. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’'`ʻʼ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/(^|\s)(sunny|sunni|sani|sanni|sonni|санни|сани)(?=\s|$)/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Starts at a word; `$` marks words that must also end there (they mean something else as a prefix). */
const w = (src: string) => new RegExp(`(?:^| )(?:${src})`, 'u');
const RULES: [LocalAct, RegExp][] = [
  ['stop', /^(toxta|toxtat|jim|bas|stop)( (bol|qil|endi))?$/],
  ['dance', w('raqs(ga)? (tush|qil)|raqsga tushib ber|oyna(b ber)?(?: |$)|dans(?: |$)')],
  ['salto', w('salto|qoqli?q? (qil|osh)|aylanib ber')],
  ['angry', w('jahl(ing|i)? chiq|jahl qil|jahldor bol|achchiqlan')],
  ['sleep', w('uxla(b qol|b ol|gin|sang)?(?: |$)|uyquga ket')],
  ['happy', w('xursand bol|quvon|kul(ib ber|gin)?(?: |$)|baxtli bol')],
  ['chase', w('meni quvla|quvlab kor|quvlashamiz')],
  ['wave', w('qol ber|qolingni ber|salomlash|qol silkit|beshlik ber')],
  ['peace', w('yarashdik|yarashamiz|yarash(aylik)?(?: |$)|kechir(ing)? meni|uzr(?: |$)')],
];

const LINES: Record<LocalAct, string[]> = {
  stop: ['Xo‘p, to‘xtadim.', 'Bo‘pti, jim bo‘ldim.'],
  dance: ['Musiqa qani? Mayli, musiqasiz ham bo‘laveradi! 💃', 'Mana raqs! Ko‘zingizni uzmang.'],
  salto: ['Hop! Qalay, zo‘rmi?', 'Salto! Sirkda ishlasam bo‘larkan.'],
  angry: ['Hmm! Mana jahlim chiqdi… lekin tez o‘tib ketadi. 😤', 'Grrr! Bo‘ldi, yetar.'],
  sleep: ['Zzz… faqat ozgina. Chaqirsangiz uyg‘onaman.', 'Ko‘zlarimni yumdim… lekin baribir eshitib turibman.'],
  happy: ['Yashasin! Kayfiyatim a’lo!', 'Hi-hi, xursandman!'],
  chase: ['Qochib qoling-chi! 😏', 'Tayyormisiz? Ushlab olaman!'],
  wave: ['Mana qo‘lim! Salom!', 'Beshlik! ✋'],
  peace: ['Bunaqa deng endi! Qani, nima qilamiz? 😏', 'Yarashdik! Ishni davom ettiramiz.'],
};

const last = new Map<LocalAct, string>();

/** A short message the robot answers by itself, or null (then it goes to the assistant). */
export function localIntent(text: string, random: () => number = Math.random): LocalIntent | null {
  const t = normalize(text);
  if (!t || t.split(' ').length > 5) return null;
  for (const [act, re] of RULES) {
    if (!re.test(t)) continue;
    const pool = LINES[act].filter((l) => l !== last.get(act));
    const reply = pool[Math.floor(random() * pool.length) % pool.length];
    last.set(act, reply);
    return { act, reply };
  }
  return null;
}
