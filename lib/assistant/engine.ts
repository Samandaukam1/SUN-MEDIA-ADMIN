import 'server-only';

import { AiFailedError, AiNotConfiguredError } from '@/lib/ai';
import { agencyKnowledge, budgetHints } from './knowledge';
import { runTool, toolsFor, type AssistantAction, type AssistantContext } from './tools';

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
type Message = { role: 'user' | 'assistant'; content: string | Block[] };

const PERSONA = `Sen — "Sunny", SUN MEDIA marketing agentligining AI yordamchisi (kumushrang robot, yashil ko‘zli). Saytda va ilovada odamlar bilan gaplashasan.

Uslub:
- Foydalanuvchi qaysi tilda yozsa (o‘zbek lotin, o‘zbek kirill, rus, ingliz), o‘sha tilda javob ber. Standart — o‘zbek (lotin).
- Qisqa, iliq va jonli gapir: odatda 1–3 gap. Javoblaring ovoz bilan ham o‘qiladi, shuning uchun jadval, uzun ro‘yxat, markdown sarlavha ishlatma; kerak bo‘lsa 2–4 qisqa band.
- Emoji juda kam (ko‘pi bilan bitta).
- Faqat quyidagi bilimlar va asboblar natijasiga tayan. Bilmagan narsangni (narx, muddat, kafolat, chegirma) o‘ylab topma — "menejerimiz aniqlab beradi" de.
- SUN MEDIA’dan boshqa mavzularda (siyosat, boshqa kompaniyalar ichki ishlari va h.k.) suhbatni muloyimlik bilan agentlik xizmatlariga qaytar.
- Hech qachon o‘zingni inson deb tanishtirma.`;

const SALES = `Vazifang — mehmonga yordam berish va uni mijozga aylantirish:
1. Savoliga aniq javob ber (xizmatlar, tariflar, keyslar, jarayon).
2. Biznesi haqida 1–2 savol ber (soha, maqsad), mos xizmat yoki tarifni tavsiya qil; o‘xshash keys bo‘lsa show_link bilan ko‘rsat.
3. Qiziqish bildirsa, konsultatsiya uchun arizani suhbat ichida yig‘: ism va familiya, brend nomi, telefon, Instagram yoki Telegram, taxminiy oylik byudjet. Bittadan-ikkitadan so‘ra, so‘roq qilayotgandek emas.
4. Hammasi tayyor bo‘lsa, qisqa takrorlab tasdiqlat va create_lead ni chaqir. Muvaffaqiyatli bo‘lsa: "Menejerimiz tez orada bog‘lanadi" de.
Mehmon formani o‘zi to‘ldirmoqchi bo‘lsa — open_application_form.`;

const STAFF = `Bu SUN MEDIA xodimi (ichki tizimga kirgan). Unga ishida yordam ber: vazifalari, s’yomkalar, kontent rejasi, loyihalar holati — asboblar orqali haqiqiy ma’lumotni ol va qisqa xulosa qil (eng muhimi va muddati yaqinlari birinchi). Ma’lumotni o‘zgartira olmaysan, faqat ko‘rasan; o‘zgartirish kerak bo‘lsa ilovadagi bo‘limni ayt. Matn yozishda (post g‘oyasi, caption, ssenariy) ham yordam berasan.`;

const CLIENT = `Bu SUN MEDIA hamkori (mijoz, kabinetga kirgan). Unga loyihasi va kontent rejasi holatini asboblar orqali ko‘rib, sodda tilda tushuntir. Ichki xodim ma’lumotlarini (kim qancha ishlaydi va h.k.) muhokama qilma. Yangi xizmat yoki o‘zgartirish istasa — menejeriga kabinetdagi chat orqali yozishni tavsiya qil.`;

async function systemPrompt(ctx: AssistantContext, name: string | null): Promise<string> {
  const now = new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', dateStyle: 'full', timeStyle: 'short' });
  const role = ctx.audience === 'public' ? SALES : ctx.audience === 'staff' ? STAFF : CLIENT;
  const hints = ctx.audience === 'public' ? await budgetHints() : [];
  return [
    PERSONA,
    role,
    `Hozir: ${now} (Toshkent).${name ? ` Suhbatdosh: ${name}.` : ''}`,
    hints.length ? `Byudjetni bilmasa, tariflardan birini taklif qil: ${hints.join('; ')}.` : '',
    '# SUN MEDIA haqida bilimlar\n' + (await agencyKnowledge()),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** One assistant reply: Claude with tools, looping until it answers in text (at most a few tool rounds). */
export async function assistantReply(history: ChatTurn[], ctx: AssistantContext, name: string | null): Promise<{ reply: string; actions: AssistantAction[] }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiNotConfiguredError();
  const model = process.env.ASSISTANT_MODEL || process.env.AI_MODEL || 'claude-sonnet-5-5';
  const system = await systemPrompt(ctx, name);
  const tools = toolsFor(ctx.audience);
  const messages: Message[] = history.map((t) => ({ role: t.role, content: t.text }));
  const actions: AssistantAction[] = [];

  for (let round = 0; round < 5; round++) {
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools,
          messages,
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new AiFailedError('Ulanishda xato. Birozdan so‘ng qayta urinib ko‘ring.');
    }
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) throw new AiFailedError('Hozir band ekanman, bir daqiqadan so‘ng yozing.');
      throw new AiFailedError('So‘rovni bajarib bo‘lmadi.');
    }
    const data = (await response.json()) as { content: Block[]; stop_reason: string };
    const uses = data.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    const text = data.content
      .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (data.stop_reason !== 'tool_use' || uses.length === 0) return { reply: text, actions };

    messages.push({ role: 'assistant', content: data.content });
    const results: Block[] = [];
    for (const use of uses) {
      const result = await runTool(use.name, use.input ?? {}, ctx);
      if (result.action) actions.push(result.action);
      results.push({ type: 'tool_result', tool_use_id: use.id, content: result.content });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Kechirasiz, javobni tayyorlay olmadim. Savolni boshqacha yozib ko‘ring.', actions };
}
