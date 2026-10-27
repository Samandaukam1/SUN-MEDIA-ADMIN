import type { SayKey } from './brain';

/**
 * Qitmir's short lines: the robot's own remarks while it plays, and a playful tail after a change the system confirmed.
 * Short, friendly, never rude or scary; each pool is drawn without repeating the line just used. A failed or refused
 * action gets no joke: its message stays exactly as the system wrote it.
 */
const SAY: Record<SayKey, string[]> = {
  grab: ['Ushladim! 😏', 'Qo‘lga tushdingiz!', 'Endi qayoqqa qochasiz? 😏', 'Mana, tutdim!'],
  miss: ['Eh, qochib qoldi!', 'Hmm… keyingi safar!', 'Tez ekansiz-a!'],
  thrown: ['Voy-voy!', 'Hey, sekinroq!', 'Uchib ketdim-ku!'],
  angry: ['Bu hali tugamadi! 😤', 'Qayta urinaman!', 'Endi jiddiy quvlayman! 😏'],
  logo: ['Bu yer meniki 😏', 'Eng zo‘r joy — logotip!', 'Biroz dam olaman…'],
  hide: ['Meni topolmaysiz… 😏', 'Sss… yashirindim.'],
  found: ['Topib oldingiz-a!', 'Eh, sezib qoldingiz!'],
  wake: ['A? Uxlamayotgan edim!', 'Voy, cho‘chib ketdim!'],
  text: ['Qiziq harf ekan…', 'Bu harfni tekshirib ko‘ray 🧐'],
  tap: ['Hi-hi, qitiq bo‘ldi!', 'Yana bir marta! 😏'],
  bored: ['Zerikdim… boshqa joyni ko‘raman.', 'Ushlab turish zerikarli ekan 😏'],
  hit: ['Hoy, tinchlikmi? Men sizga nima qildim?!', 'Bo‘ldi-da, og‘riydi-ku! 😤', 'Yana ursangiz, qochib ketaman!'],
  five: ['Beshlik! ✋', 'Zo‘r! Mana bu jamoa!'],
  nofive: ['Mayli, keyinroq…', 'Qo‘lim osilib qoldi-ku…'],
  pat: ['Hi-hi, yoqimli…', 'Yana silang-chi 😊'],
  push: ['Voy! Muvozanatim…', 'Ehtiyot bo‘ling-da!'],
};

/** After the system confirmed a change (tool name as in the chat's action chips). */
const DONE: Record<string, string[]> = {
  check_in: ['Keldingizmi nihoyat! 😏', 'Bugun ham shu yerdasiz — qoyil! 😏', 'Endi ishdan qochib bo‘lmaydi! 😈'],
  create_task: ['Endi bajarishdan qochib ko‘ring-chi! 😏', 'Muddatini eslab qoldim — qochib qutulolmaysiz. 😏', 'Ro‘yxatga tushdi, endi u sizni kuzatadi. 😈'],
  update_task: ['Vazifa endi yangidek! 😏', 'O‘zgartirdim — hech kim sezmadi… hozircha. 😏'],
  set_content_status: ['Kontent bir qadam oldinga yurdi. 😏', 'Tez almashtirdim-a? 😈'],
  send_message: ['Tez ishladim-a? 😈', 'Pochtachidan ham tezroq yetkazdim. 😏'],
  edit_message: ['Xuddi avvaldan shunday edi. 😏'],
  delete_message: ['Izini ham qoldirmadim. 😈'],
  cancelled: ['Mayli, bu safar kechirdim. 😏', 'Xo‘p, hech narsaga tegmadim. 😏'],
};
const ANY = ['Tez ishladim-a? 😏', 'Bajardim — qoyilmisiz? 😏'];

const last = new Map<string, string>();

/** A line from `pool`, never the one this pool gave last time. */
export function pick(key: string, pool: string[], random: () => number = Math.random): string {
  const options = pool.length > 1 ? pool.filter((x) => x !== last.get(key)) : pool;
  const line = options[Math.floor(random() * options.length) % options.length];
  last.set(key, line);
  return line;
}

export const say = (key: SayKey, random?: () => number) => pick(`say:${key}`, SAY[key], random);

/**
 * The system's own message, then a playful tail — only for a change that was confirmed (`ok`) or a cancellation. A
 * failure is returned untouched, so the reason is never hidden behind a joke.
 */
export function quip(message: string, name: string, ok: boolean, random?: () => number): string {
  if (!ok) return message;
  const tail = pick(`done:${name}`, DONE[name] ?? ANY, random);
  const text = message.trim();
  return text ? `${text}${/[.!?…]$/.test(text) ? '' : '.'} ${tail}` : tail;
}
