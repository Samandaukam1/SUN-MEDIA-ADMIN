import assert from 'node:assert/strict';
import test from 'node:test';

await import('./integration/hooks.mjs');
const core = await import('../lib/agents/core.ts');
const brand = await import('../lib/agents/brand.ts');
const edit = await import('../lib/agents/edit.ts');
const zip = await import('../lib/agents/zip.ts');
const ins = await import('../lib/agents/insights.ts');
const strat = await import('../lib/agents/strategy.ts');
const qa = await import('../lib/agents/qa.ts');
const images = await import('../lib/agents/images.ts');
const ai = await import('../lib/agents/ai.ts');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

// ------------------------------------------------------------------------------------------------ cadence, names, hashes

test('carousel every N days from the start date (month boundaries ignored); 1.0 file names', () => {
  assert.equal(core.isCarouselDay('2026-11-13', '2026-11-13'), true);
  assert.equal(core.isCarouselDay('2026-11-14', '2026-11-13'), false);
  assert.equal(core.isCarouselDay('2026-12-01', '2026-11-29'), true, 'across a month boundary');
  assert.equal(core.isCarouselDay('2026-11-16', '2026-11-13', 3), true);
  assert.equal(core.isCarouselDay('2026-11-12', '2026-11-13'), false, 'before the start');
  assert.equal(core.exportName({ client: 'SAFI', date: '2026-11-13', kind: 'story', slot: 1 }), 'SAFI_2026-11-13_STORY_01.png');
  assert.equal(core.exportName({ client: 'Opal Education', date: '2026-11-13', kind: 'carousel', index: 1 }), 'OPAL_EDUCATION_2026-11-13_CAROUSEL_02.png');
  assert.equal(core.exportName({ client: 'Cool Water', date: '2026-11-13', kind: 'carousel', zip: true }), 'COOL_WATER_2026-11-13_CAROUSEL.zip');
  assert.equal(core.clientSlug('O‘zbek g‘isht'), 'OZBEK_GISHT');
});

test('Uzbek text on images: o‘ / g‘ normalised to printable characters; nothing else changed', () => {
  assert.equal(core.uzText("O'zbekiston g`ozal, oʻzingiz"), 'O‘zbekiston g‘ozal, o‘zingiz');
  assert.equal(core.uzText("ma'lumot  va   e'lon"), 'ma’lumot va e’lon');
  assert.equal(core.uzText('Sotuv 2026'), 'Sotuv 2026');
});

test('version safety: any change to text, file, client or time changes the hash an approval is bound to', () => {
  const base = { profileId: A, igUsername: 'safi', kind: 'story', scheduledAt: '2026-11-13T05:00:00Z', caption: 'c', hashtags: '#a', frames: [{ headline: 'H', body: 'B', cta: 'C', path: `${A}/x/v1-1.png` }] };
  const h = core.contentHash(base);
  assert.notEqual(core.contentHash({ ...base, frames: [{ ...base.frames[0], path: `${A}/x/v2-1.png` }] }), h, 'new file');
  assert.notEqual(core.contentHash({ ...base, caption: 'c2' }), h, 'caption');
  assert.notEqual(core.contentHash({ ...base, profileId: B }), h, 'another client');
  assert.notEqual(core.contentHash({ ...base, scheduledAt: '2026-11-14T05:00:00Z' }), h, 'another slot');
  assert.equal(core.contentHash({ ...base }), h, 'stable');
});

// ------------------------------------------------------------------------------------------------ edits

test('edit instructions: deterministic edits need no image; visual ones edit only named slides; regeneration is explicit', () => {
  const c = (t, n = 4) => edit.classifyInstruction(t, n);
  assert.deepEqual(c('Orqa fonni ochroq qil').ops, [{ op: 'brightness', factor: 1.18 }]);
  assert.equal(c('Orqa fonni ochroq qil').mode, 'layout');
  assert.equal(c('Logoni biroz kichraytir').ops[0].target, 'logo');
  assert.equal(c('Mahsulotni sal kattalashtir').ops[0].target, 'product');
  assert.deepEqual(c('Matnni tepaga ko‘chir').ops, [{ op: 'move_text', to: 'top' }]);
  assert.deepEqual(c('Telefon raqamni pastga joylashtir').ops, [{ op: 'move_contact', to: 'bottom' }]);
  assert.equal(c('Ko‘proq premium uslubda qil').mode, 'image_edit');
  assert.equal(c('Odamni olib tashla').mode, 'image_edit');
  const slide2 = c('Faqat ikkinchi slaydni qayta yarat');
  assert.equal(slide2.mode, 'slide_regen');
  assert.deepEqual(slide2.slides, [1], 'only slide 2');
  assert.deepEqual(c('3-slaydda sarlavhani qisqartir').slides, [2]);
  assert.equal(c('3-slaydda sarlavhani qisqartir').mode, 'text');
  assert.equal(c('Butunlay boshqa variant qayta yarat').mode, 'regenerate');
  assert.deepEqual(edit.slidesIn('9-slayd', 4), [], 'no such slide');
});

test('layout ops are bounded; the AI plan is validated against real slides and known operations', () => {
  const l = edit.applyOps(undefined, [{ op: 'scale', target: 'logo', factor: 5 }, { op: 'brightness', factor: 0.1 }, { op: 'move_text', to: 'middle' }]);
  assert.equal(l.logoScale, 1.8);
  assert.equal(l.bgBrightness, 0.5);
  assert.equal(l.textPos, 'middle');
  const fb = edit.classifyInstruction('logoni kichraytir', 4);
  const ok = edit.parseEditPlan({ mode: 'slide_regen', slides: [2, 9], ops: [], text_targets: [], visual: 'yorqinroq' }, 4, fb);
  assert.deepEqual(ok.slides, [1], 'slide 9 does not exist; 2 → index 1');
  const bad = edit.parseEditPlan({ mode: 'layout', slides: [], ops: [{ op: 'rm -rf', target: null, to: null, factor: null }], text_targets: [], visual: '' }, 4, fb);
  assert.equal(bad, fb, 'unknown op → keyword rules');
  assert.equal(edit.parseEditPlan('garbage', 4, fb), fb);
});

// ------------------------------------------------------------------------------------------------ brand

test('brand colours: a forbidden colour in the image is reported within tolerance; greys are neutral', () => {
  const dominant = [
    { rgb: [212, 252, 24], share: 0.3 },
    { rgb: [230, 30, 40], share: 0.2 },
    { rgb: [128, 128, 128], share: 0.5 },
  ];
  const r = brand.checkColors(dominant, ['#D4FC18'], ['#E01E28'], 12);
  assert.equal(r.forbidden.length, 1);
  assert.equal(r.forbidden[0].color, '#E01E28');
  assert.equal(r.brandShare, 0.3);
  assert.equal(r.offBrand, 0.2);
  assert.equal(brand.checkColors(dominant, ['#D4FC18'], ['#0000FF']).forbidden.length, 0);
  assert.ok(brand.colorDistance([0, 0, 0], [255, 255, 255]) > 90);
  assert.ok(brand.colorDistance([212, 252, 24], [210, 250, 26]) < 2);
});

test('contacts: only verified ones, never invented; logo variant follows the background', () => {
  const dna = brand.parseDna({ contacts: { phones: ['+998 90 000 00 01', 'abc'] }, show_contacts: 'cta_only' });
  const c = brand.contactsOf({ phone: '+998 71 200 00 00', telegram: null, instagram_username: 'safi', website: null, address: null }, dna);
  assert.deepEqual(c.phones, ['+998 71 200 00 00', '+998 90 000 00 01']);
  assert.equal(brand.contactLine(c, 'cta_only', false), null);
  assert.equal(brand.contactLine(c, 'cta_only', true), '+998 71 200 00 00  ·  @safi');
  assert.equal(brand.contactLine({ phones: [], telegram: null, instagram: null, website: null, address: null, hours: null }, 'always', true), null, 'nothing to show → nothing');
  assert.equal(brand.logoVariantFor(0.1, { logo: true, light: true, dark: true }), 'logo_light');
  assert.equal(brand.logoVariantFor(0.9, { logo: true, light: true, dark: true }), 'logo_dark');
  assert.equal(brand.logoVariantFor(0.9, { logo: true, light: false, dark: false }), 'logo');
  assert.equal(brand.parseDna(null).show_contacts, 'cta_only', 'defaults');
});

// ------------------------------------------------------------------------------------------------ strategy: isolation, carousel, prompts

test('multi-client isolation in planning: the AI may only pick this client’s assets, trends and campaigns', () => {
  const plans = strat.parsePlans(
    {
      concepts: [
        { objective: 'trust', audience: 'a', concept: 'Toza suv', message: 'm', hook: 'h', cta: 'c', format: 'myth', family: 'product_hero', product_asset_ids: ['own-1', 'other-client-logo'], trend_id: 'trend-B', campaign_id: 'camp-1', why: 'w' },
        { objective: 'nonsense', concept: 'x', format: 'myth', family: 'product_hero' },
      ],
    },
    { assets: new Set(['own-1']), trends: new Set(['trend-A']), campaigns: new Set(['camp-1']) },
  );
  assert.equal(plans.length, 1, 'invalid concept dropped');
  assert.deepEqual(plans[0].product_asset_ids, ['own-1']);
  assert.equal(plans[0].trend_id, null);
  assert.equal(plans[0].campaign_id, 'camp-1');
  const chosen = strat.choosePlan([plans[0], { ...plans[0], concept: 'Yangi mavzu', format: 'howto' }], [{ date: '2026-11-12', kind: 'story', title: 'Toza suv', format: 'myth', headlines: [] }]);
  assert.equal(chosen.concept, 'Yangi mavzu', 'the less repetitive concept');
});

test('carousel package: exactly N slides; CTA only on the last; product ids limited; hashtags clean', () => {
  const frame = (i) => ({ role: `s${i}`, headline: `Sarlavha ${i}`, body: 'Matn', cta: 'Bosing', product_asset_id: i === 0 ? 'own-1' : 'foreign', visual: { subject: 's', scene: 'studio', composition: 'c', lighting: 'l', camera: 'c', palette: 'p', text_zone: 'bottom', mood: 'm' } });
  const p = strat.parsePackage({ frames: [0, 1, 2, 3].map(frame), caption: 'Caption', caption_alt: 'Alt', hashtags: ['#suv', 'toza suv', '#suv'] }, 4, new Set(['own-1']), 'Yozing');
  assert.equal(p.frames.length, 4);
  assert.deepEqual(p.frames.map((f) => f.cta), ['', '', '', 'Bosing']);
  assert.deepEqual(p.frames.map((f) => f.product_asset_id), ['own-1', null, null, null]);
  assert.deepEqual(p.hashtags, ['#suv', '#tozasuv']);
  assert.equal(strat.parsePackage({ frames: [0, 1].map(frame), caption: '', caption_alt: '', hashtags: [] }, 4, new Set(), 'x'), null, 'wrong slide count → rejected');
});

test('image prompt: scene only — no text, letters or logos; real product left for compositing', () => {
  const pr = strat.imagePrompt({ kind: 'story', visual: { subject: 'shisha', scene: 'oshxona', composition: 'markaz', lighting: 'yumshoq', camera: '35mm', palette: 'yashil', text_zone: 'bottom', mood: 'toza' }, family: 'product_hero', brandColors: ['#D4FC18'], forbiddenColors: ['#FF0000'], forbiddenDesign: 'multfilm', style: 'minimal', productPlaced: true, productZone: 'top', industry: 'Ichimlik' });
  assert.match(pr, /no text, letters, numbers, logos/i);
  assert.match(pr, /do NOT draw any product/);
  assert.match(pr, /9:16/);
  assert.match(pr, /#D4FC18/);
  assert.match(pr, /Avoid these colours: #FF0000/);
  assert.match(pr, /Never include: multfilm/);
  assert.equal(strat.industryRules('Stomatologiya klinikasi', null).name, 'Tibbiyot');
  assert.match(strat.industryRules(null, 'Xorijda o‘qish konsalting').rules, /kafolati YO‘Q/);
});

// ------------------------------------------------------------------------------------------------ quality control

test('image QA: exact size, foreign files, distorted logo and overflow fail; small sources warn', () => {
  const ok = { index: 0, expected: { w: 1080, h: 1920 }, actual: { w: 1080, h: 1920 }, paths: [`${A}/i/v1-1.png`, `${A}/assets/logo.png`], profileId: A, logo: { w: 300, h: 90, origW: 1000, origH: 300 }, logoRequired: true, sharpness: 2, colors: { forbidden: [], offBrand: 0.1 }, warnings: [] };
  assert.deepEqual(qa.checkImage(ok), []);
  const codes = (x) => qa.checkImage({ ...ok, ...x }).map((i) => `${i.code}:${i.level}`);
  assert.deepEqual(codes({ actual: { w: 1024, h: 1536 } }), ['dimensions:fail']);
  assert.deepEqual(codes({ paths: [`${B}/assets/logo.png`] }), ['cross_client_asset:fail'], 'another client’s file');
  assert.deepEqual(codes({ logo: { w: 300, h: 120, origW: 1000, origH: 300 } }), ['logo_ratio:fail'], 'stretched logo');
  assert.deepEqual(codes({ warnings: ['text_overflow'] }), ['text_overflow:fail']);
  assert.deepEqual(codes({ colors: { forbidden: [{ color: '#E01E28', share: 0.2 }], offBrand: 0.1 } }), ['forbidden_color:warn']);
  assert.deepEqual(codes({ logo: null }), ['no_logo:warn']);
});

test('content QA: another client’s phone or name, an invented number or guarantee is a failure', () => {
  const base = { kind: 'story', language: 'uz', framesExpected: 1, frames: [{ headline: 'Toza suv', body: 'Har kuni', cta: 'Yozing' }], caption: 'c', hashtags: '', title: 't', allowedText: 'Narx 15000 so‘m', forbidden: '', ownPhone: '+998712000000', others: [{ name: 'WEDRINK', username: 'wedrink', phone: '+998901112233' }], recent: [], notes: [] };
  const codes = (frames, extra = {}) => qa.checkContent({ ...base, frames, ...extra }).issues.filter((i) => i.level === 'fail').map((i) => i.code);
  assert.deepEqual(codes(base.frames), []);
  assert.ok(codes([{ headline: 'WEDRINK bilan', body: '', cta: 'Yozing' }]).includes('cross_profile'));
  assert.ok(codes([{ headline: 'Qo‘ng‘iroq: +998 90 111 22 33', body: '', cta: 'Yozing' }]).includes('foreign_phone'));
  assert.ok(codes([{ headline: '50% chegirma', body: '', cta: 'Yozing' }]).includes('unverified_number'));
  assert.deepEqual(codes([{ headline: 'Narx 15000 so‘m', body: '', cta: 'Yozing' }]), [], 'verified price allowed');
  assert.ok(codes([{ headline: '100% kafolat', body: '', cta: 'Yozing' }]).includes('unverified_guarantee'));
});

// ------------------------------------------------------------------------------------------------ export

test('ZIP package: ordered files, readable, CRC-checked, UTF-8 names', () => {
  const files = [1, 2, 3, 4].map((n) => ({ name: `SAFI_2026-11-13_CAROUSEL_0${n}.png`, data: Buffer.from(`png-${n}`.repeat(1000)) }));
  files.push({ name: 'caption.txt', data: Buffer.from('O‘zbekcha caption #suv', 'utf8') });
  const z = zip.createZip(files);
  const back = zip.readZip(z);
  assert.deepEqual(back.map((f) => f.name), files.map((f) => f.name));
  assert.ok(back.every((f) => f.crcOk));
  assert.ok(back.every((f, i) => f.data.equals(files[i].data)));
  assert.equal(zip.crc32(Buffer.from('123456789')), 0xcbf43926, 'standard CRC-32 check value');
});

// ------------------------------------------------------------------------------------------------ budget & learning

test('budget: a paid generation stops at the client’s or the agency’s limit; emergency stop always wins', () => {
  const s = { profile: { monthImages: 118, monthCost: 4, imageLimit: 120, budgetUsd: 10, emergency: false }, agency: { todayImages: 10, monthImages: 200, monthCost: 50, dailyLimit: 80, monthlyLimit: 600, budgetUsd: 100 } };
  assert.equal(ins.budgetCheck(s, 2).ok, true);
  assert.match(ins.budgetCheck(s, 4).reason, /oylik rasm limiti/);
  assert.equal(ins.budgetCheck({ ...s, profile: { ...s.profile, emergency: true } }, 1).ok, false);
  assert.match(ins.budgetCheck({ ...s, profile: { ...s.profile, monthCost: 10 } }, 1).reason, /budjeti/);
  assert.match(ins.budgetCheck({ ...s, agency: { ...s.agency, todayImages: 80 } }, 1).reason, /kunlik/);
  assert.ok(ins.budgetCheck({ ...s, profile: { ...s.profile, monthImages: 95 } }, 2).warnings.length, '80% warning');
  assert.equal(ins.budgetCheck({ ...s, profile: { ...s.profile, monthCost: null, budgetUsd: 10 } }, 1).ok, true, 'unknown cost: counts still apply');
});

test('performance learning: no verdict from fewer than 3 pieces per group; latest numbers per item count', () => {
  const row = (id, format, reach, likes) => ({ itemId: id, kind: 'carousel', format, objective: 'trust', reach, views: null, likes, comments: 0, shares: 0, saves: 0, leads: null });
  const few = ins.buildInsights([row('1', 'myth', 1000, 100), row('2', 'howto', 1000, 10)]);
  assert.equal(few.enough, false);
  assert.equal(few.recommendations.length, 0);
  const many = ins.buildInsights([...['a', 'b', 'c'].map((x) => row(x, 'myth', 1000, 120)), ...['d', 'e', 'f'].map((x) => row(x, 'howto', 1000, 20)), row('a', 'myth', 1000, 999)], { myth: 'Mif va haqiqat' });
  assert.equal(many.enough, true);
  assert.match(many.recommendations[0].text, /Mif va haqiqat/);
  assert.equal(many.byFormat.find((g) => g.key === 'myth').n, 3, 'duplicate row of item a counted once');
});

// ------------------------------------------------------------------------------------------------ trend research

test('trend research: only findings whose URL the search really returned are kept', () => {
  const body = {
    output: [
      { type: 'web_search_call', action: { type: 'search', sources: [{ url: 'https://www.example.com/design-trends-2026?utm=x' }] } },
      { type: 'message', content: [{ type: 'output_text', text: '{}', annotations: [{ type: 'url_citation', url: 'https://blog.example.org/carousels' }] }] },
    ],
  };
  const src = ai.sourcesOf(body);
  assert.equal(src.size, 2);
  assert.equal(ai.verifiedUrl('https://example.com/design-trends-2026', src), true, 'www and query ignored');
  assert.equal(ai.verifiedUrl('https://blog.example.org/carousels/', src), true);
  assert.equal(ai.verifiedUrl('https://made-up.example.net/fake', src), false);
  const f = ai.parseFindings('Mana: {"findings":[{"title":"Editorial tipografiya","source_url":"https://example.com/x","freshness":"fresh","confidence":2},{"title":"Manbasiz","source_url":"not a url"}]}');
  assert.equal(f.length, 1);
  assert.equal(f[0].confidence, 1);
  assert.equal(ai.parseFindings('no json'), null);
});

// ------------------------------------------------------------------------------------------------ OpenAI Images: real request shapes, failures fail

test('image generation: documented endpoint and parameters; base64 decoded; failures are never turned into images', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-not-real';
  process.env.OPENAI_IMAGE_PRICE_INPUT_PER_1M = '5';
  process.env.OPENAI_IMAGE_PRICE_OUTPUT_PER_1M = '40';
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  let seen;
  const ok = await images.generateImage({ prompt: 'scene', tier: 'premium', quality: 'medium' }, { fetchImpl: async (url, init) => ((seen = { url, body: JSON.parse(init.body) }), new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }], usage: { input_tokens: 100, output_tokens: 1000 } }))), sleep: async () => {} });
  assert.equal(ok.ok, true);
  assert.ok(ok.png.equals(png));
  assert.equal(seen.url, 'https://api.openai.com/v1/images/generations');
  assert.deepEqual([seen.body.model, seen.body.size, seen.body.quality, seen.body.output_format, seen.body.n], ['gpt-image-2.6-sunburst', '1024x1536', 'medium', 'png', 1]);
  assert.equal(ok.usage.costUsd, 0.0405);

  let calls = 0;
  const mod = await images.generateImage({ prompt: 'x', tier: 'fast', quality: 'low' }, { fetchImpl: async () => (calls++, new Response(JSON.stringify({ error: { code: 'moderation_blocked', message: 'blocked by safety system' } }), { status: 400 })), sleep: async () => {} });
  assert.deepEqual([mod.ok, mod.kind, calls], [false, 'moderation', 1], 'moderation: no retry');
  calls = 0;
  const rate = await images.generateImage({ prompt: 'x', tier: 'fast', quality: 'low' }, { fetchImpl: async () => (calls++, new Response('{}', { status: 429 })), sleep: async () => {} });
  assert.deepEqual([rate.ok, rate.kind, calls], [false, 'rate', 2], 'one retry, then reported');
  const missing = await images.generateImage({ prompt: 'x', tier: 'premium', quality: 'low' }, { fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'model_not_found' } }), { status: 404 }), sleep: async () => {} });
  assert.equal(missing.kind, 'model');
  const empty = await images.generateImage({ prompt: 'x', tier: 'premium', quality: 'low' }, { fetchImpl: async () => new Response(JSON.stringify({ data: [] })), sleep: async () => {} });
  assert.deepEqual([empty.ok, empty.kind], [false, 'server'], 'no image → failure, never a placeholder');

  // Edits: JSON with the image as a data URL; if the deployment wants files, the multipart form once.
  const bodies = [];
  const ed = await images.editImage({ prompt: 'brighter', images: [png], quality: 'medium' }, {
    fetchImpl: async (url, init) => {
      bodies.push({ url, body: init.body });
      if (bodies.length === 1) return new Response(JSON.stringify({ error: { message: 'Invalid image: expected multipart file' } }), { status: 400 });
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
    },
    sleep: async () => {},
  });
  assert.equal(ed.ok, true);
  assert.equal(bodies[0].url, 'https://api.openai.com/v1/images/edits');
  assert.match(JSON.parse(bodies[0].body).images[0].image_url, /^data:image\/png;base64,/);
  assert.ok(bodies[1].body instanceof FormData);
  assert.equal(bodies[1].body.get('model'), 'gpt-image-2.6-flare');
  delete process.env.OPENAI_API_KEY;
  const off = await images.generateImage({ prompt: 'x', tier: 'premium', quality: 'low' }, { fetchImpl: async () => assert.fail('no call without a key') });
  assert.equal(off.kind, 'config');
});
