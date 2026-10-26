import type { QTargets, Rect } from './brain';

/**
 * What Qitmir mode knows about the page: a few chosen elements, read as viewport rectangles. It never changes the page:
 * the only effect is a short Web Animations dip of a decorative heading word the robot lands on, which removes itself
 * (no class, attribute, text or layout change). Element lists are refreshed every few seconds; an IntersectionObserver
 * keeps track of which are on screen, and only those are measured, after a scroll or a layout change.
 */

/** Controls the robot keeps off and never "holds" the cursor over. */
const INTERACTIVE =
  'a[href], button, input, select, textarea, summary, label, iframe, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"], [role="slider"], [role="combobox"], [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
const EDITABLE = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"]';
/** Sunny's own interface and the stage are not page. */
const OWN = '.sb-root, .qm-stage';
/** Never played with: dialogs, alerts, notifications, live regions, fixed bars, and anything marked off-limits. */
const OFF_LIMITS = 'header, nav, dialog, [role="dialog"], [role="alertdialog"], [role="alert"], [role="status"], [aria-live], [data-qitmir-off]';
/** The person is busy with something that matters: the robot goes home (a modal, a locked page, a field in focus). */
const CALM = 'dialog[open], [aria-modal="true"], [role="alertdialog"], [data-qitmir-calm]';
const LOGO = '[data-qitmir-logo], svg[role="img"][aria-label="SUN MEDIA"]';
/** Decorative heading words (split headings are already animated word by word) or text marked for it. */
const WORDS = '.s-word, [data-qitmir-text]';
const HIDES = '[data-qitmir-hide], .lg';
const SIGHTS = 'h1, h2, img, video, .lg';

const rectOf = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });
const own = (el: Element) => !!el.closest(OWN);

export function interactive(target: EventTarget | null): boolean {
  return target instanceof Element && !!(target.closest(INTERACTIVE) || target.closest(OWN) || target.closest('[role="dialog"]'));
}
function editable(el: Element | null): boolean {
  return !!el && !own(el) && el.matches(EDITABLE);
}

export class QitmirDom {
  private logo: Element | null = null;
  private words: HTMLElement[] = [];
  private hides: HTMLElement[] = [];
  private sights: Element[] = [];
  private controls: Element[] = [];
  private readonly ids = new WeakMap<Element, number>();
  private readonly byId = new Map<number, HTMLElement>();
  private nextId = 1;
  private readonly seen = new Set<Element>();
  private readonly observed = new Set<Element>();
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  /** Letters of each word, relative to the word (they do not move inside it when the page scrolls). */
  private letters = new WeakMap<Element, Rect[]>();
  private readonly animations = new Set<Animation>();
  private scannedAt = -1e9;
  private dirty = true;
  private calmAt = -1e9;
  private calm = false;
  private typing = false;

  private readonly onScroll = () => {
    this.dirty = true;
  };
  private readonly onResize = () => {
    this.dirty = true;
    this.scannedAt = -1e9;
    this.letters = new WeakMap();
  };
  private readonly onFocus = () => {
    this.typing = editable(document.activeElement);
    this.calmAt = -1e9;
  };
  /** Focus has not moved on yet while `focusout` runs: look once it has. */
  private readonly onBlur = () => setTimeout(this.onFocus, 0);

  start() {
    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('focusin', this.onFocus);
    document.addEventListener('focusout', this.onBlur);
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) this.seen.add(e.target);
            else this.seen.delete(e.target);
          }
          this.dirty = true;
        },
        { rootMargin: '80px' },
      );
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        this.dirty = true;
        this.letters = new WeakMap();
      });
      this.ro.observe(document.body);
    }
    this.onFocus();
  }

  dispose() {
    document.removeEventListener('scroll', this.onScroll, { capture: true });
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('focusin', this.onFocus);
    document.removeEventListener('focusout', this.onBlur);
    this.io?.disconnect();
    this.ro?.disconnect();
    for (const a of this.animations) a.cancel();
    this.animations.clear();
    this.observed.clear();
    this.seen.clear();
    this.byId.clear();
    this.scannedAt = -1e9;
  }

  private id(el: HTMLElement): number {
    let id = this.ids.get(el);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(el, id);
    }
    this.byId.set(id, el);
    return id;
  }

  /** The element lists (every few seconds, on resize, on a new page). */
  private scan() {
    const all = <T extends Element>(sel: string, cap: number) => Array.from(document.querySelectorAll<T>(sel)).filter((el) => !own(el)).slice(0, cap);
    this.logo = all(LOGO, 4)[0] ?? null;
    this.words = all<HTMLElement>(WORDS, 80).filter((el) => !el.closest(OFF_LIMITS) || el.closest('[data-qitmir-text]'));
    this.hides = all<HTMLElement>(HIDES, 60).filter((el) => !el.closest(OFF_LIMITS) && getComputedStyle(el).position !== 'fixed');
    this.sights = all(SIGHTS, 60).filter((el) => !el.closest('header, nav, dialog, [role="dialog"]'));
    this.controls = all(INTERACTIVE, 180);
    this.byId.clear();
    const wanted = new Set<Element>([...this.words, ...this.hides, ...this.sights, ...this.controls]);
    for (const el of this.observed) {
      if (!wanted.has(el)) {
        this.io?.unobserve(el);
        this.observed.delete(el);
        this.seen.delete(el);
      }
    }
    for (const el of wanted) {
      if (this.observed.has(el)) continue;
      this.observed.add(el);
      if (this.io) this.io.observe(el);
      else this.seen.add(el);
    }
    for (const el of [...this.words, ...this.hides]) this.id(el);
  }

  /** Fresh targets after a scroll, a resize or a layout change; null when nothing moved. */
  refresh(now: number): QTargets | null {
    if (now - this.scannedAt > 4) {
      this.scan();
      this.scannedAt = now;
      this.dirty = true;
    }
    if (!this.dirty) return null;
    this.dirty = false;
    return this.read();
  }

  private read(): QTargets {
    const W = innerWidth;
    const H = innerHeight;
    const on = (r: Rect, margin = 0) => r.w > 0 && r.h > 0 && r.x + r.w > -margin && r.x < W + margin && r.y + r.h > -margin && r.y < H + margin;
    const logoRect = this.logo ? rectOf(this.logo.getBoundingClientRect()) : null;

    const words: { el: HTMLElement; rect: Rect }[] = [];
    for (const el of this.words) {
      if (words.length >= 24) break;
      if (!this.seen.has(el)) continue;
      const rect = rectOf(el.getBoundingClientRect());
      if (rect.y < 84 || rect.y + rect.h > H - 16 || rect.x < 8 || rect.x + rect.w > W - 8) continue;
      words.push({ el, rect });
    }
    // Only words with nothing written right above them (a heading's top line): the robot needs room to stand.
    const covered = (r: Rect) => words.some(({ rect: o }) => o !== r && o.x < r.x + r.w && o.x + o.w > r.x && o.y + o.h > r.y - 0.6 * r.h && o.y < r.y - 0.3 * r.h);
    const texts: QTargets['texts'] = [];
    for (const { el, rect } of words) {
      if (texts.length >= 8) break;
      if (covered(rect)) continue;
      const letters = this.lettersOf(el, rect).map((o) => ({ x: rect.x + o.x, y: rect.y + o.y, w: o.w, h: o.h }));
      if (letters.length) texts.push({ id: this.id(el), rect, letters });
    }

    const focused = document.activeElement;
    const hides: QTargets['hides'] = [];
    for (const el of this.hides) {
      if (hides.length >= 10) break;
      if (!this.seen.has(el) || (focused && el.contains(focused))) continue;
      const rect = rectOf(el.getBoundingClientRect());
      if (rect.w < 180 || rect.h < 110 || rect.y < 90 || rect.y > H - 80 || rect.x < 0 || rect.x + rect.w > W) continue;
      hides.push({ id: this.id(el), rect });
    }

    const sights: Rect[] = [];
    for (const el of this.sights) {
      if (sights.length >= 10) break;
      if (!this.seen.has(el)) continue;
      const rect = rectOf(el.getBoundingClientRect());
      if (on(rect) && rect.w >= 100 && rect.h >= 40) sights.push(rect);
    }

    const colliders: Rect[] = [];
    for (const el of this.controls) {
      if (colliders.length >= 60) break;
      if (!this.seen.has(el)) continue;
      const rect = rectOf(el.getBoundingClientRect());
      // A whole card that is a link is not a button to keep off.
      if (!on(rect, 40) || rect.w * rect.h > 70_000 || (rect.w > 420 && rect.h > 160)) continue;
      colliders.push(rect);
    }

    return { logo: logoRect && on(logoRect) ? logoRect : null, texts, hides, sights, colliders };
  }

  /** Up to three letters of a word (first, middle, last), measured with a Range: the text itself is untouched. */
  private lettersOf(el: HTMLElement, base: Rect): Rect[] {
    const known = this.letters.get(el);
    if (known) return known;
    const out: Rect[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode() as Text | null;
    const text = node?.data ?? '';
    const chars = [...text.matchAll(/\p{L}|\p{N}/gu)].map((m) => m.index ?? 0);
    if (node && chars.length) {
      const picks = [...new Set([chars[0], chars[Math.floor(chars.length / 2)], chars[chars.length - 1]])].slice(0, chars.length > 3 ? 3 : 2);
      const range = document.createRange();
      for (const i of picks) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ x: r.left - base.x, y: r.top - base.y, w: r.width, h: r.height });
      }
      range.detach();
    }
    this.letters.set(el, out);
    return out;
  }

  /** The robot landed on a word: it dips under the weight and springs back (a temporary transform only). */
  poke(id: number) {
    const el = this.byId.get(id);
    if (!el?.isConnected || typeof el.animate !== 'function') return;
    const frames: Keyframe[] = [
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(0.09em) rotate(-2deg)', offset: 0.3 },
      { transform: 'translateY(-0.02em) rotate(0.6deg)', offset: 0.65 },
      { transform: 'translateY(0) rotate(0deg)' },
    ];
    let a: Animation;
    try {
      a = el.animate(frames, { duration: 620, easing: 'ease-out', composite: 'add' });
    } catch {
      a = el.animate(frames, { duration: 620, easing: 'ease-out' });
    }
    this.animations.add(a);
    const done = () => this.animations.delete(a);
    a.onfinish = done;
    a.oncancel = done;
  }

  /** A modal, a locked page or a field in focus: the person is busy, the robot should be home. Checked ~2× a second. */
  busy(now: number): boolean {
    if (now - this.calmAt < 0.4) return this.calm;
    this.calmAt = now;
    const root = document.documentElement;
    this.calm = this.typing || root.style.overflow === 'hidden' || document.body.style.overflow === 'hidden' || !!document.querySelector(CALM);
    return this.calm;
  }

  selecting(): boolean {
    const s = document.getSelection();
    return !!s && !s.isCollapsed && s.toString().trim().length > 0;
  }
}
