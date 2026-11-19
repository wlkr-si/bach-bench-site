import { readDetail } from './vault';
import { provenance } from './results';

'use strict';
/* =====================================================================
   BACH BENCH CHART SYSTEM — prototype
   Sections, each meant to move into the site as its own module:
     1 tokens · 2 identity · 3 data · 4 metrics & format · 5 measure & svg
     6 scales & axes · 7 not-available strip · 8 label engine · 9 marks
     10 chart renderers · 11 chart definitions · 12 state & address
     13 controls · 14 frame (page) · 15 export (feed) · 16 boot
   ===================================================================== */

/* ============ 1. TOKENS ============ */
const COLOR = { card:'#0a0a0a', ink:'#f7f7f7', text:'#d4d4d4', muted:'#a0a0a0', tick:'#8f8f8f', faint:'#6b6b6b',
  axis:'#2e2e2e', grid:'#161616', quad:'#0d1c13', quadEdge:'#2a4a36', hull:'#121212', hullEdge:'#1d1d1d', ref:'#9a9a9a', leader:'#5c5c5c', demo:'#d4a017' };
const SANS = "Geist, 'Helvetica Neue', Arial, sans-serif", MONO = "'Geist Mono', ui-monospace, Menlo, monospace";
/* Two densities of the same primitives. `page` is the on-site rendering at
   1 CSS px per unit; `feed` is the exported image (1600×900 / 1080×1350) sized
   to stay legible when X shrinks it to a phone-width feed. */
const SIZE = {
  page: { title:15, caption:12, legend:12, source:11, label:12, effort:10, tick:11, axisTitle:11.5, count:10.5,
          mk:5, ring:1.25, outline:2, hair:1, line:1.75, leader:0.9, halo:3.5, tickLen:3, labelGap:4,
          rowH:20, wordRow:24, hit:22, lineH:1.15 },
  feed: { title:58, caption:27, legend:26, source:24, label:25, effort:21, tick:23, axisTitle:24, count:22,
          mk:11, ring:3, outline:4.4, hair:2, line:4, leader:2, halo:7, tickLen:7, labelGap:8,
          rowH:44, wordRow:52, hit:0, lineH:1.15 },
};
const FORMATS = { '4x5': { W:1080, H:1350, pad:60 }, '16x9': { W:1600, H:900, pad:64 } };
const MOTION = { move:240, fade:180, enter:200, stagger:12, staggerMax:200 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ============ 2. IDENTITY: lab = shape + colour, fixed slot ============
   First 16 slots: 8 hues (validated on #0a0a0a; adjacent CVD 6.1 is legal only
   because shape always rides along) × filled shapes for slots 0–7 and
   outlined/new shapes for 8–15, with the hue rotated by 3 so no two slots
   share both shape and colour. A lab keeps its slot forever; new labs append. */
const LAB_SLOTS = ['Anthropic','OpenAI','xAI','Cursor','Google','Meta','DeepSeek','Mistral','Alibaba','Moonshot','Zhipu','Amazon','NVIDIA','Tencent','Microsoft','Reka','MiniMax'];
const HUES = ['#e36b40','#337aef','#bb4cb5','#0bad87','#b88410','#8a7cf0','#e0567a','#4fa83d'];
const SHAPES = ['sun','circle','cross','square','triangle','diamond','star','hexagon','triangleDown','plus','ring','squareO','diamondO','triangleO','hexagonO','starO','plusO'];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const IDS = new Map();
/* Labs named in legends. Others still draw with their own shape and colour. */
const LEGEND_LABS = ['Anthropic','OpenAI','xAI','Google'];
function labIdentity(lab){
  if (IDS.has(lab)) return IDS.get(lab);
  let i = LAB_SLOTS.indexOf(lab);
  if (i < 0){ LAB_SLOTS.push(lab); i = LAB_SLOTS.length - 1; }
  const s = i % SHAPES.length;
  const L = { name: lab, slug: slug(lab), slot: i, color: HUES[(s + (s >= 8 ? 3 : 0)) % 8], shape: SHAPES[s] };
  IDS.set(lab, L); return L;
}

/* ============ 3. DATA ============ */
const EFFORTS = ['minimal','low','medium','high','xhigh','max'];
function prepare(raw){
  const pieces = raw.pieces.map(p => Object.assign({}, p, { L: labIdentity(p.lab), fk: p.modelId || p.model }));
  for (const p of pieces){
    const runs = pieces.filter(q => q.fk === p.fk && q.effort);
    p.fam = p.effort && new Set(runs.map(q => q.effort)).size > 1 ? 'f:' + p.fk : 'p:' + p.id;
    p.name = p.model;
    p.full = p.effort && p.fam.startsWith('f:') ? `${p.model} (${p.effort})` : p.model;
  }
  return pieces;
}
/* ============ 4. METRICS & FORMAT ============ */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const parseDate = s => s ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null;
const trim0 = s => s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
const fmtUsdTick = v => '$' + (v >= 1 ? trim0(v.toFixed(v < 10 && v % 1 ? 1 : 0)) : trim0(v.toPrecision(2)));
const fmtUsd = v => v >= 1 ? `$${v.toFixed(2)}` : v >= 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(4)}`;
const fmtK = v => v >= 1000 ? trim0((v / 1000).toFixed(v % 1000 ? 1 : 0)) + 'k' : trim0(v.toPrecision(3));
const fmtInt = v => v == null ? 'n/a' : Math.round(v).toLocaleString('en-US');
const fmtScore = v => v == null ? 'n/a' : String(Math.round(v));
const fmtSecTick = v => trim0(v.toPrecision(3)) + 's';
const fmtDate = t => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const SAY_TOKENS = 'Tokens are as each provider reported for the single run that made the Piece.';
/* Every metric a chart can put on an axis. `say` is the one plain sentence
   the caption uses; `na` names the not-available strip. */
const M = {
  cost:       { better:'low', label:'Cost', lower:'cost', axis:'Cost per Piece (USD)', get:p => p.costUsd, log:true, na:'Price unknown', tick:fmtUsdTick, fmt:fmtUsd, say:'Cost uses the reported charge for paid runs and list price for subscription runs.' },
  time:       { better:'low', label:'Time to make', lower:'time to make', axis:'Time to make (s)', get:p => p.timeSeconds, log:true, na:'Not recorded', tick:fmtSecTick, fmt:v => Math.round(v) + ' s', say:'Time to make runs from sending the Instruction to receiving the finished reply.' },
  thinking:   { better:'low', label:'Thinking tokens', lower:'thinking tokens', axis:'Thinking tokens', get:p => p.thinkingTokens, log:true, na:'Not reported', tick:fmtK, fmt:fmtInt, say:SAY_TOKENS },
  output:     { better:'low', label:'Output tokens', lower:'output tokens', axis:'Output tokens', get:p => p.outputTokens, log:true, na:'Not reported', tick:fmtK, fmt:fmtInt, say:SAY_TOKENS },
  complexity: { better:'high', label:'Complexity', axis:'Complexity', get:p => p.complexity, score:true, na:'Not scored', tick:String, fmt:fmtScore, say:'Complexity measures how much is going on: pitches, rhythm, range and change in the sound, and detail, colour and motion in the picture. A fixed formula scores each recorded Clip from 0 to 100.' },
  music:      { better:'high', label:'Music complexity', axis:'Music complexity', get:p => p.musicComplexity, score:true, na:'Not scored', tick:String, fmt:fmtScore, say:'Music complexity is the sound half of Complexity, by a fixed formula.' },
  picture:    { better:'high', label:'Picture complexity', axis:'Picture complexity', get:p => p.pictureComplexity, score:true, na:'Not scored', tick:String, fmt:fmtScore, say:'Picture complexity is the image half of Complexity, by a fixed formula.' },
  sync:       { better:'high', label:'Sync', axis:'Sync', get:p => p.sync, score:true, na:'Not scored', tick:String, fmt:fmtScore, say:'Sync measures how closely visible changes line up with audible attacks and shifts in the sound. A fixed formula scores each recorded Clip from 0 to 100.' },
  uniqueness: { better:'high', label:'Uniqueness', axis:'Uniqueness', get:p => p.uniqueness, score:true, na:'Not scored', tick:String, fmt:fmtScore, say:'Uniqueness measures how far each Piece’s sound, picture, structure and title sit from every other published Piece. A fixed formula scores it from 0 to 100, so it shifts as Pieces are added.' },
  balance:    { better:'high', label:'Balance', axis:'Balance', get:p => p.balance, score:true, na:'Not scored', tick:String, fmt:fmtScore, say:'Balance is the lowest of a Piece’s field standings on Complexity, Sync and Uniqueness, so it shifts as models are added.' },
  release:    { label:'Model release', axis:'Model release', get:p => parseDate(p.releaseDate), time:true, na:'Release date unknown', fmt:fmtDate, say:'Release date is the lab’s announcement date.' },
};

/* ============ 5. MEASURE & SVG TEXT ============ */
const mctx = document.createElement('canvas').getContext('2d');
const MCACHE = new Map();
function tw(str, size, weight = 500, mono = false, italic = false){
  const k = `${str}|${size}|${weight}|${mono}|${italic}`;
  if (MCACHE.has(k)) return MCACHE.get(k);
  mctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${mono ? MONO : SANS}`;
  const w = mctx.measureText(str).width; MCACHE.set(k, w); return w;
}
function wrap(str, size, maxW, weight = 400, italic = false){
  const out = []; let cur = '';
  for (const w of str.split(' ')){ const t = cur ? cur + ' ' + w : w; if (cur && tw(t, size, weight, false, italic) > maxW){ out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur); return out;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = n => Math.round(n * 10) / 10;
function T(x, y, str, { size, weight = 500, fill = COLOR.text, mono = false, italic = false, anchor = 'start', halo = 0, ls = 0, attrs = '' }){
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}"${italic ? ' font-style="italic"' : ''} fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''}${halo ? ` stroke="${COLOR.card}" stroke-width="${halo}" stroke-linejoin="round" paint-order="stroke"` : ''} ${attrs}>${esc(str)}</text>`;
}
const BRAND_D = ['M-87,-5 C-87,-53 -47,-92 1,-92 C49,-92 89,-53 89,-5 C89,3 83,9 75,9 C67,9 61,3 61,-5 C61,-38 34,-64 1,-64 C-32,-64 -59,-38 -59,-5 C-59,3 -65,9 -73,9 C-81,9 -87,3 -87,-5 Z','M-92,24 C-94,17 -89,12 -82,12 H68 C76,12 81,18 79,25 C70,65 35,91 -7,91 C-48,91 -82,64 -92,24 Z'];
const brandG = (cx, cy, px, fill = COLOR.ink) => `<g transform="translate(${f1(cx)} ${f1(cy)}) scale(${f1(px / 200 * 1000) / 1000})" fill="${fill}"><g transform="rotate(-24)"><path transform="translate(0 -7)" d="${BRAND_D[0]}"/><path transform="translate(0 8)" d="${BRAND_D[1]}"/></g></g>`;
const brandSvg = px => `<svg width="${px}" height="${px}" viewBox="-100 -100 200 200" aria-hidden="true">${brandG(0, 0, 200, 'currentColor')}</svg>`;

/* ============ 6. SCALES & AXES ============ */
function linScale(d0, d1, r0, r1){ const f = v => r0 + (v - d0) / ((d1 - d0) || 1) * (r1 - r0); f.d = [d0, d1]; f.r = [r0, r1]; return f; }
function logScale(d0, d1, r0, r1){ const a = Math.log10(d0), b = Math.log10(d1); const f = v => r0 + (Math.log10(v) - a) / ((b - a) || 1) * (r1 - r0); f.d = [d0, d1]; f.r = [r0, r1]; f.log = true; return f; }
function niceStep(span, n){ const raw = span / Math.max(1, n), p = 10 ** Math.floor(Math.log10(raw)); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw - 1e-12) return m * p; return 10 * p; }
/* Domain: scores 0..ceil-to-10 (cap 100); other linear 0..nice; log padded ~5% each side in log space; time padded 6%. */
function domainFor(m, vals, log){
  if (!vals.length) return m.time ? [Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31)] : log ? [1, 100] : [0, 100];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (m.time){ const span = Math.max(hi - lo, 864e5 * 60); return [lo - span * .06, hi + span * .06]; }
  if (log){ const a = Math.log10(lo), b = Math.log10(hi), pad = Math.max((b - a) * .06, .08); return [10 ** (a - pad), 10 ** (b + pad)]; }
  if (m.score){ return [0, Math.min(100, Math.max(20, Math.ceil((hi + 3) / 10) * 10))]; }
  const st = niceStep(hi, 5); return [0, Math.ceil(hi * 1.04 / st) * st];
}
/* Tick pickers: densest set whose labels keep `minGap` apart. Log axes try
   mantissas 1-2-3-4-5-6-8 per decade first (like the reference), then thin. */
function fitsTicks(ticks, sc, label, S, dir){
  if (dir === 'v') { for (let i = 1; i < ticks.length; i++) if (Math.abs(sc(ticks[i]) - sc(ticks[i - 1])) < S.tick * 1.9) return false; return true; }
  let prev = -Infinity;
  for (const t of ticks){ const w = tw(label(t), S.tick, 400, true), x = sc(t); if (x - w / 2 < prev + S.tick * 1.1) return false; prev = x + w / 2; }
  return true;
}
function logTicks(sc, label, S, dir){
  const [d0, d1] = sc.d, e0 = Math.floor(Math.log10(d0)), e1 = Math.ceil(Math.log10(d1));
  for (const set of [[1,2,3,4,5,6,8],[1,2,3,5],[1,2,5],[1,3],[1]]){
    const t = [];
    for (let e = e0; e <= e1; e++) for (const m of set){ const v = +(m * 10 ** e).toPrecision(3); if (v >= d0 && v <= d1) t.push(v); }
    if (t.length >= 2 && fitsTicks(t, sc, label, S, dir)) return t;
  }
  const t = []; for (let e = e0; e <= e1; e++){ const v = 10 ** e; if (v >= d0 && v <= d1) t.push(v); }
  for (let k = 2; k < 6 && !fitsTicks(t, sc, label, S, dir); k++) t.splice(0, t.length, ...t.filter((_, i) => i % k === 0));
  return t;
}
function linTicks(sc, label, S, dir){
  const [d0, d1] = sc.d;
  for (let n = 12; n >= 2; n--){
    const st = niceStep(d1 - d0, n), t = [];
    for (let v = Math.ceil(d0 / st) * st; v <= d1 + 1e-9; v += st) t.push(+v.toPrecision(10));
    if (fitsTicks(t, sc, label, S, dir)) return t;
  }
  return [d0, d1];
}
function timeTicks(sc, S){
  const [d0, d1] = sc.d;
  for (const step of [1, 2, 3, 6, 12]){
    const t = []; const a = new Date(d0);
    let y = a.getUTCFullYear(), mo = a.getUTCMonth() + 1;
    for (;;){ if (mo > 11){ y++; mo -= 12; } const v = Date.UTC(y, mo, 1); if (v > d1) break; if (mo % step === 0) t.push(v); mo++; }
    const lab = timeLabel(t);
    if (fitsTicks(t, sc, lab, S, 'h')) return { t, lab };
  }
  return { t: [], lab: timeLabel([]) };
}
function timeLabel(ticks){ const first = ticks[0]; return v => { const d = new Date(v); const m = d.getUTCMonth(); return MONTHS[m] + (m === 0 || v === first ? ' ’' + String(d.getUTCFullYear()).slice(2) : ''); }; }
function axisX(S, sc, ticks, lab, y, x0, x1){
  let s = `<line x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x1)}" y2="${f1(y)}" stroke="${COLOR.axis}" stroke-width="${S.hair}"/>`;
  for (const t of ticks){ const x = sc(t); s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x)}" y2="${f1(y + S.tickLen)}" stroke="${COLOR.axis}" stroke-width="${S.hair}"/>` + T(x, y + S.tickLen + S.tick * 1.15, lab(t), { size: S.tick, weight: 400, mono: true, fill: COLOR.tick, anchor: 'middle' }); }
  return s;
}
function axisY(S, sc, ticks, lab, x, y0, y1){
  let s = `<line x1="${f1(x)}" y1="${f1(y0)}" x2="${f1(x)}" y2="${f1(y1)}" stroke="${COLOR.axis}" stroke-width="${S.hair}"/>`;
  for (const t of ticks){ const y = sc(t); s += `<line x1="${f1(x - S.tickLen)}" y1="${f1(y)}" x2="${f1(x)}" y2="${f1(y)}" stroke="${COLOR.axis}" stroke-width="${S.hair}"/>` + T(x - S.tickLen - S.tick * .45, y + S.tick * .36, lab(t), { size: S.tick, weight: 400, mono: true, fill: COLOR.tick, anchor: 'end' }); }
  return s;
}

/* ============ 7. NOT-AVAILABLE STRIP ============
   Missing x → a column right of the plot with its own baseline stub and
   name ("Price unknown"). Missing y → a row under the plot with a dotted guide. */
function swarm(points, axis, step){
  const placed = [];
  for (const q of points.sort((a, b) => a[axis === 'x' ? 'Y' : 'X'] - b[axis === 'x' ? 'Y' : 'X'])){
    const base = q[axis === 'x' ? 'X' : 'Y'];
    for (const k of [0, 1, -1, 2, -2, 3, -3]){
      q[axis === 'x' ? 'X' : 'Y'] = base + k * step;
      if (!placed.some(o => Math.hypot(o.X - q.X, o.Y - q.Y) < step * .95)) break;
    }
    placed.push(q);
  }
}

/* ============ 8. LABEL ENGINE ============
   Survival rule (applies to every chart): candidates are placed greedily in
   priority order — the selected model, then extremes (top 3 and bottom 1 on
   the vertical, ends of the horizontal), then by isolation (distance to the
   nearest neighbouring mark). Each label tries 8 spots touching its mark
   (right first, it reads fastest), then up to 3 rings further out with a
   hairline leader. A label may not overlap a mark, a label, a leader, or sit
   nearer another mark than its own. Whatever cannot fit is dropped: crowds
   thin from the inside out, the tooltip still names every mark. */
function rankLabels(items, S, hl){
  const n = items.length;
  for (const a of items){ let d = Infinity; for (const b of items) if (b !== a && b.id !== a.id){ const dd = Math.hypot(a.X - b.X, a.Y - b.Y); if (dd < d) d = dd; } a.iso = d === Infinity ? 400 : d; }
  const byY = [...items].sort((a, b) => a.Y - b.Y), byX = [...items].sort((a, b) => a.X - b.X);
  const ext = new Set([byY[0], byY[1], byY[2], byY[n - 1], byX[0], byX[n - 1]].filter(Boolean));
  for (const a of items){ a.extreme = ext.has(a); a.pri = (a.id === hl ? 1e6 : 0) + (a.extreme ? 1e4 : 0) + Math.min(a.iso, 400); a.isKey = a.id === hl || a.extreme || a.iso > S.mk * 9; }
}
const hit = (a, b, m) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const boxDist = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));
function segX(p1, p2, p3, p4){ const d = (a, b, c) => (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]); const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)); }
function segBox(a, b, r){
  if (Math.max(a[0], b[0]) < r.x || Math.min(a[0], b[0]) > r.x + r.w || Math.max(a[1], b[1]) < r.y || Math.min(a[1], b[1]) > r.y + r.h) return false;
  if (a[0] >= r.x && a[0] <= r.x + r.w && a[1] >= r.y && a[1] <= r.y + r.h) return true;
  const c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  return [0, 1, 2, 3].some(i => segX(a, b, c[i], c[(i + 1) % 4]));
}
const LEADER_ANG = [0, 180, -35, 35, 145, -145, -90, 90, -60, 60, -120, 120].map(a => a * Math.PI / 180);
const WIDE_ANG = Array.from({ length: 24 }, (_, i) => i * 15 * Math.PI / 180);
function placeLabels(cands, obstacles, bounds, S){
  const placed = [], leaders = [], out = [], left = [];
  const own = (c, o) => o.owner === c.id || (c.fam && o.owner === c.fam);
  const marks = obstacles.filter(o => o.mark);
  const touching = ({ ax, ay, r, w, h }) => { const g = S.labelGap; return [
      [ax + r + g, ay - h / 2], [ax - r - g - w, ay - h / 2],
      [ax + r * .4, ay - r - g * .4 - h], [ax + r * .4, ay + r + g * .4], [ax - r * .4 - w, ay - r - g * .4 - h], [ax - r * .4 - w, ay + r + g * .4],
      [ax - w / 2, ay - r - g - h], [ax - w / 2, ay + r + g],
    ].map(([x, y]) => ({ x, y })); };
  const ring = (c, dists, angs) => { const sp = []; for (const dist of dists) for (const a of angs){
      const ux = Math.cos(a), uy = Math.sin(a), px = c.ax + ux * (c.r + dist), py = c.ay + uy * (c.r + dist);
      sp.push({ x: ux > .3 ? px : ux < -.3 ? px - c.w : px - c.w / 2, y: uy < -.3 ? py - c.h : uy > .3 ? py : py - c.h / 2, leader: true }); } return sp; };
  const fits = (c, sp, relaxed) => {
    const { ax, ay, r, w, h } = c, box = { x: sp.x, y: sp.y, w, h };
    if (box.x < bounds.x || box.y < bounds.y || box.x + w > bounds.x + bounds.w || box.y + h > bounds.y + bounds.h) return null;
    if (obstacles.some(o => (o.mark || !own(c, o)) && hit(box, o, own(c, o) ? 0 : 1))) return null; // never cover any mark, its own included
    if (placed.some(o => hit(box, o, 2))) return null;
    let seg = null;
    if (sp.leader){
      const nx = Math.max(box.x, Math.min(ax, box.x + w)), ny = Math.max(box.y, Math.min(ay, box.y + h)), an = Math.atan2(ny - ay, nx - ax);
      seg = [[ax + Math.cos(an) * (r + 2), ay + Math.sin(an) * (r + 2)], [nx - Math.cos(an) * 2, ny - Math.sin(an) * 2]];
      if (placed.some(o => segBox(seg[0], seg[1], o)) || marks.some(o => !own(c, o) && segBox(seg[0], seg[1], o))) return null;
      if (!relaxed && leaders.some(l => segX(l[0], l[1], seg[0], seg[1]))) return null;
      if (marks.some(o => !own(c, o) && boxDist(box, o.x + o.w / 2, o.y + o.h / 2) < S.mk * 2.6)) return null; // a leader label keeps clear of other marks
    } else {
      const dOwn = boxDist(box, ax, ay);
      if (marks.some(o => !own(c, o) && boxDist(box, o.x + o.w / 2, o.y + o.h / 2) < dOwn + S.mk * 1.5)) return null; // clearly nearer its own mark
    }
    return { box, seg };
  };
  const take = (c, b) => { placed.push(b.box); if (b.seg) leaders.push(b.seg); out.push(Object.assign({}, c, b)); };
  cands.sort((a, b) => b.pri - a.pri);
  for (const c of cands){
    const spots = c.noLeader ? touching(c) : touching(c).concat(ring(c, [c.h * 1.3, c.h * 2.3, c.h * 3.4], LEADER_ANG));
    let best = null; for (const sp of spots) if ((best = fits(c, sp, false))) break;
    if (best) take(c, best); else if (c.must) left.push(c);
  }
  // names that must appear (exports with ≤25 points): wider rings, then the nearest free spot anywhere
  for (const c of left){
    let best = null;
    for (const sp of ring(c, [c.h * 4.6, c.h * 6, c.h * 8, c.h * 10.5, c.h * 13], WIDE_ANG)) if ((best = fits(c, sp, true))) break;
    if (!best){
      const grid = [];
      for (let y = bounds.y; y + c.h <= bounds.y + bounds.h; y += c.h / 2) for (let x = bounds.x; x + c.w <= bounds.x + bounds.w; x += c.h / 2) grid.push({ x, y, leader: true, d: boxDist({ x, y, w: c.w, h: c.h }, c.ax, c.ay) });
      grid.sort((a, b) => a.d - b.d);
      for (const sp of grid) if ((best = fits(c, sp, true))) break;
    }
    if (best) take(c, best);
  }
  return out;
}
function renderLabels(placed, S){
  return placed.map(l => {
    const at = `data-id="${esc(l.id)}"${l.fam ? ` data-fam="${esc(l.fam)}"` : ''}`;
    let s = '';
    if (l.seg) s += `<line ${at} x1="${f1(l.seg[0][0])}" y1="${f1(l.seg[0][1])}" x2="${f1(l.seg[1][0])}" y2="${f1(l.seg[1][1])}" stroke="${COLOR.leader}" stroke-width="${S.leader}" stroke-linecap="round"/>`;
    return s + T(l.box.x, l.box.y + l.size * .8, l.text, { size: l.size, weight: l.weight, fill: l.fill, halo: S.halo, attrs: at });
  }).join('');
}
function labelCand(id, fam, text, ax, ay, S, o = {}){
  const size = o.size || S.label, weight = o.weight || 500;
  return Object.assign({ id, fam, text, ax, ay, r: S.mk * 1.45, size, weight, fill: o.fill || COLOR.text, w: tw(text, size, weight), h: size * 1.02, pri: 0 }, o);
}
const markObstacle = (m, S) => ({ x: m.X - S.mk * 1.45, y: m.Y - S.mk * 1.45, w: S.mk * 2.9, h: S.mk * 2.9, owner: m.id, mark: true });

/* ============ 9. MARKS ============ */
function poly(n, R, rot, inner){ const pts = [], m = inner ? n * 2 : n; for (let i = 0; i < m; i++){ const a = rot + i * Math.PI * 2 / m, rad = inner && i % 2 ? inner : R; pts.push(`${f1(Math.cos(a) * rad)},${f1(Math.sin(a) * rad)}`); } return 'M' + pts.join('L') + 'Z'; }
function shapePath(shape, s){
  const base = shape.replace(/O$/, '');
  switch (base){
    case 'circle': case 'ring': { const r = base === 'ring' ? s * .95 : s; return `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`; }
    case 'square': { const h = s * .88; return `M${f1(-h)},${f1(-h)}H${f1(h)}V${f1(h)}H${f1(-h)}Z`; }
    case 'sun': return poly(8, s * 1.4, -Math.PI / 2, s * .74);
    case 'star': return poly(5, s * 1.5, -Math.PI / 2, s * .72);
    case 'triangle': return poly(3, s * 1.5, -Math.PI / 2).replace(/,(-?[\d.]+)/g, (_, y) => ',' + f1(+y + s * .25));
    case 'triangleDown': return poly(3, s * 1.5, Math.PI / 2).replace(/,(-?[\d.]+)/g, (_, y) => ',' + f1(+y - s * .25));
    case 'diamond': return poly(4, s * 1.28, -Math.PI / 2);
    case 'hexagon': return poly(6, s * 1.1, 0);
    case 'cross': case 'plus': {
      const a = s * 1.25, t = s * .5, P = [[-t,-a],[t,-a],[t,-t],[a,-t],[a,t],[t,t],[t,a],[-t,a],[-t,t],[-a,t],[-a,-t],[-t,-t]];
      const rot = base === 'cross' ? Math.PI / 4 : 0, c = Math.cos(rot), si = Math.sin(rot);
      return 'M' + P.map(([x, y]) => `${f1(x * c - y * si)},${f1(x * si + y * c)}`).join('L') + 'Z';
    }
  }
  return shapePath('circle', s);
}
const isOutline = shape => shape === 'ring' || shape.endsWith('O');
/* One marker for every chart: filled shapes get a surface ring so overlaps
   stay separable; outline shapes get a surface fill. `hlr` is the selection ring. */
function markerSVG(L, S, size = S.mk, sel = true){
  const d = shapePath(L.shape, size);
  const body = isOutline(L.shape)
    ? `<path d="${d}" fill="${COLOR.card}" stroke="${COLOR.card}" stroke-width="${f1(S.outline + S.ring * 2)}" stroke-linejoin="round"/><path d="${d}" fill="${COLOR.card}" stroke="${L.color}" stroke-width="${S.outline}" stroke-linejoin="round"/>`
    : `<path d="${d}" fill="${L.color}" stroke="${COLOR.card}" stroke-width="${f1(S.ring * 2)}" stroke-linejoin="round" paint-order="stroke"/>`;
  return (sel ? `<circle class="hlr" r="${f1(size * 2.1)}" fill="none" stroke="${COLOR.ink}" stroke-width="${f1(S.hair * 1.25)}"/>` : '') + body;
}
const markerIcon = (L, px = 13) => `<svg width="${px}" height="${px}" viewBox="-7.5 -7.5 15 15" aria-hidden="true">${markerSVG(L, SIZE.page, 5, false)}</svg>`;

/* ============ 10. CHART RENDERERS ============
   Every renderer takes ctx = { S, w, h?, pieces, def, cfg, hl, density } and
   returns a scene { axes, lines, marks[{key,id,fam,X,Y,html,row?}], labels,
   hits[{id,x,y,w?,h?,px?,py?}], h }. The page mounts a scene into layers and
   animates marks by key; export stringifies the same scene. */
/* QUADRANT — "higher on a higher-is-better measure, lower on a lower-is-better
   one", bounded by the FIELD median on each axis (all Pieces in the data set
   with both values, never changed by the lab filter). Drawn only when both
   axes have a direction. Strip Pieces (no price) are outside the plot area,
   so they are never inside it. A Piece exactly on a median is outside. */
const median = v => { const a = [...v].sort((x, y) => x - y), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const quadAvailable = (xm, ym) => !!(xm.better && ym.better);
function quadMedians(field, xm, ym, xLog, yLog){
  const ok = (v, log) => v != null && isFinite(v) && (!log || v > 0);
  const fv = field.map(p => [xm.get(p), ym.get(p)]).filter(([a, b]) => ok(a, xLog) && ok(b, yLog));
  return fv.length >= 2 ? { mx: median(fv.map(v => v[0])), my: median(fv.map(v => v[1])) } : null;
}
function quadrant(ctx, xm, ym, xs, ys, xLog, yLog, b){
  if (ctx.cfg.quad !== 'on' || !quadAvailable(xm, ym)) return '';
  const md = quadMedians(ctx.field || ctx.pieces, xm, ym, xLog, yLog); if (!md) return '';
  const S = ctx.S, cl = (v, a, z) => Math.max(a, Math.min(z, v));
  const X = cl(xs(md.mx), b.plotL, b.plotR), Y = cl(ys(md.my), b.plotT, b.plotB);
  const x0 = xm.better === 'low' ? b.plotL : X, x1 = xm.better === 'low' ? X : b.plotR, y0 = ym.better === 'high' ? b.plotT : Y, y1 = ym.better === 'high' ? Y : b.plotB;
  return `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}" fill="${COLOR.quad}"/>`
    + `<line x1="${f1(X)}" y1="${f1(b.plotT)}" x2="${f1(X)}" y2="${f1(b.plotB)}" stroke="${COLOR.quadEdge}" stroke-width="${S.hair}"/>`
    + `<line x1="${f1(b.plotL)}" y1="${f1(Y)}" x2="${f1(b.plotR)}" y2="${f1(Y)}" stroke="${COLOR.quadEdge}" stroke-width="${S.hair}"/>`;
}
const axisName = (m, log) => !log ? m.axis : m.axis.endsWith(')') ? m.axis.slice(0, -1) + ', log)' : m.axis + ' (log)';
function renderScatter(ctx){
  const { S, w, h, cfg, def } = ctx;
  const xm = M[cfg.x], ym = M[cfg.y];
  const xLog = !!(xm.log && cfg.xLog), yLog = !!(ym.log && cfg.yLog);
  const ok = (v, log) => v != null && isFinite(v) && (!log || v > 0);
  const main = [], cols = new Map(), rows = new Map();
  const bucket = (map, k, v) => (map.get(k) || map.set(k, []).get(k)).push(v);
  for (const p of ctx.pieces){
    const xv = xm.get(p), yv = ym.get(p), ox = ok(xv, xLog), oy = ok(yv, yLog);
    if (ox && oy) main.push({ p, xv, yv });
    else if (!ox && oy) bucket(cols, xv == null ? xm.na : '0', { p, yv });
    else if (ox && !oy) bucket(rows, yv == null ? ym.na : '0', { p, xv });
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a === '0' ? -1 : b === '0' ? 1 : 0), colKeys = [...cols.keys()].sort((a, b) => Number(b === '0') - Number(a === '0'));
  const xd = domainFor(xm, main.map(d => d.xv).concat([...rows.values()].flat().map(d => d.xv)), xLog);
  const yd = domainFor(ym, main.map(d => d.yv).concat([...cols.values()].flat().map(d => d.yv)), yLog);
  // vertical layout
  const inset = S.mk * 2.4;
  const topPad = S.axisTitle * 1.9, xBand = S.tickLen + S.tick * 1.5, xTitleH = S.axisTitle * 1.8;
  const rowH = S.mk * 3.6, rowsBand = rowKeys.length ? rowKeys.length * rowH + S.mk : 0;
  const baseY = h - xTitleH - xBand, plotB = baseY - rowsBand, plotT = topPad;
  const ys = (yLog ? logScale : linScale)(yd[0], yd[1], plotB - inset * .6, plotT + inset * .4);
  const yLab = ym.time ? timeLabel([]) : ym.tick;
  const yt = ym.time ? [] : (yLog ? logTicks : linTicks)(ys, yLab, S, 'v');
  // horizontal layout
  const yLabW = Math.max(0, ...yt.map(t => tw(yLab(t), S.tick, 400, true)), ...rowKeys.map(k => tw(k, S.tick, 400, true)));
  const plotL = Math.ceil(yLabW + S.tickLen + S.tick * .5);
  const colW = k => Math.max(tw(k, S.tick, 400, true) + S.tick * .6, S.mk * 6);
  const stripW = colKeys.reduce((a, k) => a + colW(k) + S.tick * 1.4, 0);
  let xLabel = xm.tick, xr0 = plotL + inset, xr1;
  const endW = tw(xm.time ? 'Dec ’26' : xm.tick(xd[1]), S.tick, 400, true) / 2;
  const plotR = w - stripW - Math.max(S.mk, endW - inset + 2);
  xr1 = plotR - inset;
  const xs = (xLog ? logScale : linScale)(xd[0], xd[1], xr0, xr1);
  let xt;
  if (xm.time){ const r = timeTicks(xs, S); xt = r.t; xLabel = r.lab; }
  else xt = (xLog ? logTicks : linTicks)(xs, xLabel, S, 'h');
  // axes
  let axes = quadrant(ctx, xm, ym, xs, ys, xLog, yLog, { plotL, plotR, plotT, plotB }) + axisY(S, ys, yt, yLab, plotL, plotT, baseY) + axisX(S, xs, xt, xLabel, baseY, plotL, plotR);
  axes += T(0, S.axisTitle * .95, axisName(ym, yLog), { size: S.axisTitle, weight: 500, fill: COLOR.muted });
  axes += T((plotL + plotR) / 2, h - S.axisTitle * .35, axisName(xm, xLog), { size: S.axisTitle, weight: 500, fill: COLOR.muted, anchor: 'middle' });
  const rowY = {};
  rowKeys.forEach((k, i) => {
    const y = plotB + S.mk + rowH * (i + .5); rowY[k] = y;
    axes += `<line x1="${f1(plotL)}" y1="${f1(y)}" x2="${f1(plotR)}" y2="${f1(y)}" stroke="${COLOR.axis}" stroke-width="${S.hair}" stroke-dasharray="${f1(S.hair)} ${f1(S.hair * 4)}" stroke-linecap="round"/>`;
    axes += T(plotL - S.tickLen - S.tick * .45, y + S.tick * .36, k, { size: S.tick, weight: 400, mono: true, fill: COLOR.tick, anchor: 'end' });
  });
  const colX = {}; let cx0 = plotR + S.tick * 1.4;
  for (const k of colKeys){
    const cw = colW(k), cx = cx0 + cw / 2; colX[k] = cx;
    axes += `<line x1="${f1(cx0)}" y1="${f1(baseY)}" x2="${f1(cx0 + cw)}" y2="${f1(baseY)}" stroke="${COLOR.axis}" stroke-width="${S.hair}"/>`;
    axes += T(cx, baseY + S.tickLen + S.tick * 1.15, k, { size: S.tick, weight: 400, mono: true, fill: COLOR.tick, anchor: 'middle' });
    cx0 += cw + S.tick * 1.4;
  }
  // positions
  const marks = [];
  const push = (p, X, Y, free) => marks.push({ key: p.id, id: p.id, fam: p.fam, p, X, Y, free, html: markerSVG(p.L, S) });
  for (const d of main) push(d.p, xs(d.xv), ys(d.yv), true);
  for (const k of colKeys){ const g = cols.get(k).map(d => ({ p: d.p, X: colX[k], Y: ys(d.yv) })); swarm(g, 'x', S.mk * 2.4); g.forEach(q => push(q.p, q.X, q.Y, false)); }
  for (const k of rowKeys){ const g = rows.get(k).map(d => ({ p: d.p, X: xs(d.xv), Y: rowY[k] })); swarm(g, 'y', S.mk * 1.1); g.forEach(q => push(q.p, q.X, q.Y, false)); }
  // overlap rule: marks closer than 2.5 × radius are pushed apart symmetrically until they clear;
  // a displaced mark keeps a hairline back to a 1px dot at its true position
  const free = marks.filter(m => m.free), minD = S.mk * 2.5;
  free.forEach(m => { m.tx = m.X; m.ty = m.Y; });
  for (let it = 0; it < 60; it++){
    let moved = false;
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++){
      const a = free[i], b = free[j]; let dx = b.X - a.X, dy = b.Y - a.Y, d = Math.hypot(dx, dy);
      if (d >= minD - .01) continue;
      if (d < .01){ dx = 1; dy = 0; d = 1; }
      const k = (minD - d) / 2 / d; a.X -= dx * k; a.Y -= dy * k; b.X += dx * k; b.Y += dy * k; moved = true;
    }
    if (!moved) break;
  }
  let truth = '';
  for (const m of free) if (Math.hypot(m.X - m.tx, m.Y - m.ty) > 1.5)
    truth += `<g data-fam="${esc(m.fam)}" data-id="${esc(m.id)}"><line x1="${f1(m.tx)}" y1="${f1(m.ty)}" x2="${f1(m.X)}" y2="${f1(m.Y)}" stroke="${COLOR.muted}" stroke-width="${S.leader}"/><circle cx="${f1(m.tx)}" cy="${f1(m.ty)}" r="${f1(S.hair * 1.2)}" fill="${COLOR.ink}"/></g>`;
  // family lines: same model, different effort only
  const fams = {}; marks.filter(m => m.free && m.fam.startsWith('f:')).forEach(m => (fams[m.fam] = fams[m.fam] || []).push(m));
  let lines = truth; const obstacles = [];
  for (const [f, ms] of Object.entries(fams)){
    if (ms.length < 2) continue;
    ms.sort((a, b) => EFFORTS.indexOf(a.p.effort) - EFFORTS.indexOf(b.p.effort));
    lines += `<polyline data-fam="${esc(f)}" points="${ms.map(m => f1(m.X) + ',' + f1(m.Y)).join(' ')}" fill="none" stroke="${ms[0].p.L.color}" stroke-opacity=".6" stroke-width="${S.line}" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (let i = 1; i < ms.length; i++){ const a = ms[i - 1], b = ms[i], n = Math.ceil(Math.hypot(b.X - a.X, b.Y - a.Y) / (S.mk * 2)); for (let j = 1; j < n; j++){ const t = j / n; obstacles.push({ x: a.X + (b.X - a.X) * t - S.line, y: a.Y + (b.Y - a.Y) * t - S.line, w: S.line * 2, h: S.line * 2, owner: f }); } }
  }
  // reference line (off by default; states a plain fact)
  const dots = `stroke="${COLOR.ref}" stroke-width="${f1(S.line * 1.2)}" stroke-dasharray="0 ${f1(S.line * 3)}" stroke-linecap="round" fill="none"`;
  if (cfg.ref === 'on' && def.ref === 'frontier'){
    const free = marks.filter(m => m.free).sort((a, b) => xm.get(a.p) - xm.get(b.p) || ym.get(b.p) - ym.get(a.p));
    let best = -Infinity; const fr = [];
    for (const m of free){ const v = ym.get(m.p); if (v > best){ best = v; fr.push(m); } }
    if (fr.length > 1) lines += `<polyline data-ref="1" points="${fr.map(m => f1(m.X) + ',' + f1(m.Y)).join(' ')}" ${dots}/>`;
  }
  if (cfg.ref === 'on' && def.ref === 'diagonal'){
    const lo = Math.max(xd[0], yd[0]), hi = Math.min(xd[1], yd[1]);
    if (lo < hi) lines += `<line data-ref="1" x1="${f1(xs(lo))}" y1="${f1(ys(lo))}" x2="${f1(xs(hi))}" y2="${f1(ys(hi))}" ${dots}/>`;
  }
  // labels
  marks.forEach(m => obstacles.push(markObstacle(m, S)));
  obstacles.push({ x: 0, y: 0, w: tw(axisName(ym, yLog), S.axisTitle, 500) + S.tick, h: topPad * .8, owner: '-' });
  rankLabels(marks, S, ctx.hl);
  const cands = [];
  const famDone = new Set();
  for (const m of marks){
    if (ctx.density === 'none' && m.id !== ctx.hl) continue;
    if (ctx.density === 'key' && !m.isKey) continue;
    if (m.fam.startsWith('f:') && fams[m.fam] && fams[m.fam].length > 1){
      const ms = fams[m.fam], end = ms[ms.length - 1];
      if (!famDone.has(m.fam)){ famDone.add(m.fam); const pri = Math.max(...ms.map(q => q.pri)) + 50; cands.push(labelCand(end.id, m.fam, m.p.name, end.X, end.Y, S, { pri, must: ctx.mustName, weight: 500, fill: ms.some(q => q.id === ctx.hl) ? COLOR.ink : COLOR.text })); }
      if (ctx.density === 'all') cands.push(labelCand(m.id, m.fam, m.p.effort, m.X, m.Y, S, { size: S.effort, fill: COLOR.muted, pri: m.pri - 600, noLeader: true }));
      continue;
    }
    cands.push(labelCand(m.id, m.fam, m.p.name, m.X, m.Y, S, { pri: m.pri, must: ctx.mustName, fill: m.id === ctx.hl ? COLOR.ink : COLOR.text, weight: m.id === ctx.hl ? 600 : 500 }));
  }
  const placed = placeLabels(cands, obstacles, { x: plotL + 2, y: 0, w: w - plotL - 2, h: baseY - S.hair * 2 }, S);
  return { axes, lines, marks, labels: renderLabels(placed, S), hits: marks.map(m => ({ id: m.id, x: m.X, y: m.Y })), h };
}

function convexHull(pts){
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
  for (const p of pts){ while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()){ while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function renderMap(ctx){
  const { S, w, h } = ctx;
  const pts = ctx.pieces.filter(p => p.map && p.map.x != null);
  if (pts.length < 2) return { axes: '', lines: '', marks: [], labels: '', hits: [], h };
  // crowds, in the engine's own distances: linked when closer than 2× the median nearest-neighbour gap
  const D = (a, b) => Math.hypot(a.map.x - b.map.x, a.map.y - b.map.y);
  const nn = pts.map(p => Math.min(...pts.filter(q => q !== p).map(q => D(p, q)))).sort((a, b) => a - b);
  const link = 2 * nn[Math.floor(nn.length / 2)];
  const par = pts.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (D(pts[i], pts[j]) < link) par[find(i)] = find(j);
  const groups = {}; pts.forEach((_, i) => (groups[find(i)] = groups[find(i)] || []).push(i));
  // gentle radial compression around the biggest crowd so one far outlier can't shrink the rest
  const big = Object.values(groups).sort((a, b) => b.length - a.length)[0];
  const cx0 = big.reduce((a, i) => a + pts[i].map.x, 0) / big.length, cy0 = big.reduce((a, i) => a + pts[i].map.y, 0) / big.length;
  const Wp = pts.map(p => { const dx = p.map.x - cx0, dy = p.map.y - cy0, r = Math.hypot(dx, dy) || 1e-9, r2 = Math.pow(r, .6); return [dx / r * r2, -dy / r * r2]; });
  const padX = Math.max(S.mk * 4, w * .1), padY = S.mk * 4;
  const area = { x: padX, y: padY, w: w - 2 * padX, h: h - 2 * padY };
  let bestA = 0, bestK = -1;
  for (let deg = 0; deg < 180; deg += 5){
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), RX = Wp.map(([x, y]) => x * c - y * s), RY = Wp.map(([x, y]) => x * s + y * c);
    const k = Math.min(area.w / (Math.max(...RX) - Math.min(...RX) || 1), area.h / (Math.max(...RY) - Math.min(...RY) || 1));
    if (k > bestK * 1.02){ bestK = k; bestA = a; }
  }
  const ca = Math.cos(bestA), sa = Math.sin(bestA), X = Wp.map(([x, y]) => x * ca - y * sa), Y = Wp.map(([x, y]) => x * sa + y * ca);
  const x0 = Math.min(...X), x1 = Math.max(...X), y0 = Math.min(...Y), y1 = Math.max(...Y), k = Math.min(area.w / ((x1 - x0) || 1), area.h / ((y1 - y0) || 1));
  const ox = area.x + (area.w - (x1 - x0) * k) / 2, oy = area.y + (area.h - (y1 - y0) * k) / 2;
  const P = pts.map((p, i) => ({ p, id: p.id, fam: p.fam, X: ox + (X[i] - x0) * k, Y: oy + (Y[i] - y0) * k }));
  const minD = S.mk * 2.7;
  for (let it = 0; it < 60; it++) for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++){
    const dx = P[j].X - P[i].X, dy = P[j].Y - P[i].Y, d = Math.hypot(dx, dy) || .01;
    if (d < minD){ const m = (minD - d) / 2, ux = dx / d || 1, uy = dy / d; P[i].X -= ux * m; P[i].Y -= uy * m; P[j].X += ux * m; P[j].Y += uy * m; }
  }
  const obstacles = []; let axes = '';
  const crowds = Object.values(groups).filter(g => g.length >= 3).map(g => g.map(i => P[i]));
  for (const g of crowds){
    const hull = convexHull(g.map(q => [q.X, q.Y])), sw = S.mk * 5.2, d = 'M' + hull.map(([x, y]) => f1(x) + ',' + f1(y)).join('L') + 'Z';
    axes += `<path d="${d}" fill="${COLOR.hullEdge}" stroke="${COLOR.hullEdge}" stroke-width="${f1(sw + S.hair * 2)}" stroke-linejoin="round"/><path d="${d}" fill="${COLOR.hull}" stroke="${COLOR.hull}" stroke-width="${f1(sw)}" stroke-linejoin="round"/>`;
    if (g.length < 5) continue;
    const cx = (Math.min(...g.map(q => q.X)) + Math.max(...g.map(q => q.X))) / 2, t = `${g.length} Pieces`, tW = tw(t, S.count, 500, true);
    const yTop = Math.min(...g.map(q => q.Y)) - sw / 2 - S.count * .5, yBot = Math.max(...g.map(q => q.Y)) + sw / 2 + S.count * 1.2;
    const ly = yTop - S.count > 0 ? yTop : yBot;
    axes += T(cx, ly, t, { size: S.count, weight: 500, mono: true, fill: COLOR.muted, anchor: 'middle', halo: S.halo });
    obstacles.push({ x: cx - tW / 2, y: ly - S.count, w: tW, h: S.count * 1.2, owner: '-' });
  }
  const inCrowd = new Set(crowds.flat().map(q => q.id));
  const marks = P.map(q => ({ key: q.id, id: q.id, fam: q.fam, p: q.p, X: q.X, Y: q.Y, html: markerSVG(q.p.L, S) }));
  marks.forEach(m => obstacles.push(markObstacle(m, S)));
  rankLabels(marks, S, ctx.hl);
  const cands = marks.filter(m => ctx.density === 'all' || m.id === ctx.hl || (ctx.density === 'key' && (!inCrowd.has(m.id) || m.isKey)))
    .map(m => { const out = !inCrowd.has(m.id); return labelCand(m.id, m.fam, m.p.full, m.X, m.Y, S, { pri: m.pri + (out ? 1e4 : 0), must: ctx.mustName, weight: out || m.id === ctx.hl ? 600 : 500, fill: out || m.id === ctx.hl ? COLOR.ink : COLOR.text }); });
  const placed = placeLabels(cands, obstacles, { x: 0, y: 0, w, h }, S);
  return { axes, lines: '', marks, labels: renderLabels(placed, S), hits: marks.map(m => ({ id: m.id, x: m.X, y: m.Y })), h };
}

/* COLUMNS — one vertical bar per model, tallest first, values on top, lab
   shape under each bar and the model name slanted below it. Scores share a
   fixed 0–100 scale so the three home charts read against each other. */
function renderColumns(ctx){
  const { S, w, def } = ctx, vm = M[def.value];
  const rows = ctx.pieces.filter(p => vm.get(p) != null).sort((a, b) => vm.get(b) - vm.get(a) || a.name.localeCompare(b.name))
    .concat(ctx.pieces.filter(p => vm.get(p) == null));
  const n = Math.max(rows.length, 1), ANG = 50, COS = Math.cos(ANG * Math.PI / 180), SIN = Math.sin(ANG * Math.PI / 180);
  // the left gutter holds the scale and the slanted name of the first bar
  let slot = w / n, nameSize, nameW, padL = 0;
  for (let k = 0; k < 3; k++){
    nameSize = Math.min(S.tick, slot * .66);
    nameW = Math.max(...rows.map(p => tw(p.full, nameSize, 500)), 0);
    padL = Math.max(tw('100', nameSize, 400, true) + S.labelGap * 2, nameW * COS - slot * .5);
    slot = (w - padL) / n;
  }
  const size = Math.min(S.tick, slot * .62), mk = Math.min(S.mk, slot * .3), Sx = Object.assign({}, S, { mk });
  const bw = Math.max(2, Math.min(slot * .68, S.mk * 5)), rr = Math.min(bw / 2, S.hair * 2.5);
  // a fixed height (the page's plot or an export frame) holds the bars and the slanted names together
  const top = size * 1.6, below = mk * 3.4 + S.labelGap * 2, nameH = nameW * SIN + S.hair;
  const plotH = ctx.exp ? Math.max(S.rowH * 3, ctx.h - top - below - nameH) : ctx.h || S.rowH * 10, base = top + plotH;
  const sc = linScale(0, 100, base, top);
  const nameY = base + below, H = nameY + nameH;
  let axes = '';
  for (const t of [25, 50, 75, 100]) axes += `<line x1="${f1(padL)}" y1="${f1(sc(t))}" x2="${f1(w)}" y2="${f1(sc(t))}" stroke="${COLOR.grid}" stroke-width="${S.hair}" stroke-dasharray="${f1(S.hair * 2)} ${f1(S.hair * 3)}"/>`;
  for (const t of [0, 50, 100]) axes += T(padL - S.labelGap * 1.5, sc(t) + nameSize * .36, String(t), { size: f1(nameSize), weight: 400, mono: true, fill: COLOR.tick, anchor: 'end' });
  axes += `<line x1="${f1(padL)}" y1="${f1(base)}" x2="${f1(w)}" y2="${f1(base)}" stroke="${COLOR.axis}" stroke-width="${S.hair}"/>`;
  const marks = [], hits = [];
  rows.forEach((p, i) => {
    const v = vm.get(p), cx = slot / 2, X = padL + i * slot;
    let html = '';
    const yTop = v == null ? base : sc(Math.max(0, v));
    if (v != null && base - yTop > .5){ const h = base - yTop, r = Math.min(rr, h); html += `<path d="M${f1(cx - bw / 2)},${f1(base)}V${f1(yTop + r)}a${f1(r)},${f1(r)} 0 0 1 ${f1(r)},${f1(-r)}H${f1(cx + bw / 2 - r)}a${f1(r)},${f1(r)} 0 0 1 ${f1(r)},${f1(r)}V${f1(base)}Z" fill="${p.L.color}"/>`; }
    html += T(cx, yTop - size * .45, fmtScore(v), { size: f1(size), weight: 500, mono: true, fill: v == null ? COLOR.faint : COLOR.ink, anchor: 'middle' });
    html += `<g transform="translate(${f1(cx)} ${f1(base + mk * 1.6 + S.labelGap)})">${markerSVG(p.L, Sx)}</g>`;
    html += `<g transform="translate(${f1(cx + nameSize * .3)} ${f1(nameY)}) rotate(-${ANG})">${T(0, 0, p.full, { size: f1(nameSize), weight: 500, fill: p.id === ctx.hl ? COLOR.ink : COLOR.muted, anchor: 'end' })}</g>`;
    marks.push({ key: p.id, id: p.id, fam: p.fam, p, X, Y: 0, html, row: true });
    hits.push({ id: p.id, x: X, y: top, w: slot, h: H - top, px: X + cx, py: yTop });
  });
  return { axes, lines: '', marks, labels: '', hits, h: H };
}

const STOP = new Set(['a','an','and','at','in','of','the','to','on','for','with','by','from','into']);
function renderWords(ctx){
  const { S, w } = ctx, users = new Map();
  for (const p of ctx.pieces){ const ws = new Set((p.title || '').toLowerCase().match(/[a-z0-9']+/g) || []); for (const x of ws) if (!STOP.has(x)) (users.get(x) || users.set(x, []).get(x)).push(p); }
  const all = [...users.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  let multi = all.filter(([, u]) => u.length >= 2); const once = all.filter(([, u]) => u.length < 2).map(([x]) => x);
  const tailSize = S.tick, tailLines = 2, tailH = once.length ? tailSize * 1.5 * tailLines + S.tick : 0;
  const cols = w > S.label * 60 && multi.length > 5 ? 2 : 1;
  let rowH = S.wordRow, folded = [];
  if (ctx.h){ const maxPer = Math.max(1, Math.floor((ctx.h - tailH) / (S.wordRow * .75))); folded = multi.slice(maxPer * cols).map(([x]) => x); multi = multi.slice(0, maxPer * cols); rowH = Math.min(S.wordRow * 1.3, (ctx.h - tailH) / Math.max(1, Math.ceil(multi.length / cols))); }
  const per = Math.max(1, Math.ceil(multi.length / cols)), gap = S.label * 3, colW = (w - gap * (cols - 1)) / cols;
  const wSize = S.label * 1.05, wordW = Math.max(0, ...multi.map(([x]) => tw(x, wSize, 600))) + S.label * 1.2;
  const maxC = Math.max(1, ...multi.map(([, u]) => u.length));
  const unit = Math.min(S.mk * 3.3, (colW - wordW - S.label * 2.5) / maxC), mk = Math.min(S.mk, unit / 3.3), Sx = Object.assign({}, S, { mk });
  let axes = ''; const marks = [], hits = [];
  multi.forEach(([word, us], idx) => {
    const c = Math.floor(idx / per), i = idx % per, x0 = c * (colW + gap), y = i * rowH + rowH / 2;
    axes += T(x0, y + wSize * .36, word, { size: wSize, weight: 600, fill: COLOR.ink });
    us.sort((a, b) => a.L.slot - b.L.slot || a.name.localeCompare(b.name)).forEach((p, u) => {
      const X = x0 + wordW + u * unit + unit / 2;
      marks.push({ key: p.id + '|' + word, id: p.id, fam: p.fam, p, X, Y: y, html: markerSVG(p.L, Sx) });
      hits.push({ id: p.id, x: X, y });
    });
    axes += T(x0 + wordW + us.length * unit + S.label * .5, y + S.label * .36, String(us.length), { size: S.label, weight: 500, mono: true, fill: COLOR.muted });
  });
  const tail = folded.concat(once);
  if (tail.length){
    const lines = wrap(`Once: ${tail.join(' · ')}`, tailSize, w, 500);
    lines.slice(0, tailLines).forEach((ln, i) => { axes += T(0, per * rowH + S.tick + tailSize * (.9 + 1.5 * i), i === tailLines - 1 && lines.length > tailLines ? ln.replace(/ ·? ?\S*$/, ' …') : ln, { size: tailSize, weight: 500, fill: COLOR.faint }); });
  }
  return { axes, lines: '', marks, labels: '', hits, h: per * rowH + tailH };
}

/* ============ 11. CHART DEFINITIONS ============
   A chart = a renderer + which controls it binds + how its title/caption
   read from its config. Adding a chart is adding one entry here. */
const SCORE_Y = ['balance','complexity','sync','uniqueness','music','picture'];
const quadOn = c => c.quad === 'on' || (c.quad === 'auto' && c.y === 'balance' && c.x === 'cost');
const CHARTS = [
  { key:'cc', render:renderScatter, ref:'frontier', refName:'Frontier',
    controls:['y','x','scale','quad','ref'], xOptions:['cost','time','thinking','output'], yOptions:SCORE_Y,
    defaults:{ x:'cost', y:'balance', scale:'log', quad:'auto', ref:'off' },
    cfg: c => ({ x:c.x, y:c.y, xLog:c.scale === 'log', yLog:false, ref:c.ref, quad: quadOn(c) && quadAvailable(M[c.x], M[c.y]) ? 'on' : 'off' }),
    title: c => `${M[c.y].label} vs. ${M[c.x].lower}`,
    caption: c => (quadOn(c) && quadAvailable(M[c.x], M[c.y]) ? `Shaded: ${M[c.y].better === 'high' ? 'above' : 'below'} the field’s median ${M[c.y].label} and ${M[c.x].better === 'low' ? 'below' : 'above'} its median ${M[c.x].lower}. ` : '') + `${M[c.y].say} ${M[c.x].say}`,
    height: w => w < 560 ? 400 : Math.round(Math.min(560, Math.max(400, w * .46))),
    tip: (p, c) => { const r = [[M[c.y].label, fmtScore(M[c.y].get(p))]]; if (c.y === 'balance') r.push(['Complexity', fmtScore(p.complexity)], ['Sync', fmtScore(p.sync)], ['Uniqueness', fmtScore(p.uniqueness)]); if (c.y === 'complexity') r.push(['Music', fmtScore(p.musicComplexity)], ['Picture', fmtScore(p.pictureComplexity)]); const xv = M[c.x].get(p); r.push([M[c.x].label, xv == null ? M[c.x].na : M[c.x].fmt(xv)]); return r; } },
  { key:'map', render:renderMap, controls:[], defaults:{},
    title: () => 'Which Pieces are alike', caption: () => 'Pieces sit close together when their sound, picture, structure and title measure alike. Directions carry no meaning.',
    height: w => w < 560 ? 380 : Math.round(Math.min(480, w * .42)),
    tip: p => [['Uniqueness', fmtScore(p.uniqueness)], ['Complexity', fmtScore(p.complexity)], ['Sync', fmtScore(p.sync)]] },
  { key:'sync', render:renderColumns, value:'sync', controls:[], defaults:{}, height: w => w < 560 ? 168 : 240,
    title: () => 'Sync', caption: () => M.sync.say,
    tip: p => [['Sync', fmtScore(p.sync)], ['Event', fmtScore(p.syncEvent)], ['Continuous', fmtScore(p.syncCont)], ['Lag', p.lagMs != null ? p.lagMs + ' ms' : 'n/a']] },
  { key:'to', render:renderScatter, ref:'diagonal', refName:'1:1',
    controls:['scale','ref'], defaults:{ scale:'log', ref:'off' },
    cfg: c => ({ x:'output', y:'thinking', xLog:c.scale === 'log', yLog:c.scale === 'log', ref:c.ref }),
    title: () => 'Thinking vs. output', caption: () => SAY_TOKENS,
    height: w => w < 560 ? 400 : Math.round(Math.min(520, Math.max(380, w * .42))),
    tip: p => [['Thinking', fmtInt(p.thinkingTokens)], ['Output', fmtInt(p.outputTokens)], ['Lines of code', fmtInt(p.linesOfCode)]] },
  { key:'ct', render:renderScatter, controls:['y'], yOptions:SCORE_Y, defaults:{ y:'complexity' },
    cfg: c => ({ x:'release', y:c.y, xLog:false, yLog:false }),
    title: c => `${M[c.y].label} over time`, caption: c => `${M.release.say} ${M[c.y].say}`,
    height: w => w < 560 ? 380 : Math.round(Math.min(480, Math.max(360, w * .38))),
    tip: (p, c) => [['Released', p.releaseDate ? fmtDate(parseDate(p.releaseDate)) : 'n/a'], [M[c.y].label, fmtScore(M[c.y].get(p))]] },
  { key:'words', render:renderWords, controls:[], defaults:{},
    title: () => 'Words in titles', caption: () => 'Each mark is one model that used the word in its Piece’s title. Words like “the” are left out.',
    tip: () => [] },
  ...['complexity', 'sync', 'uniqueness'].map(k => ({ key:'col-' + k, home:true, render:renderColumns, value:k, controls:[], defaults:{},
    title: () => M[k].label, caption: () => M[k].say, height: () => 168,
    tip: p => k === 'complexity' ? [['Complexity', fmtScore(p.complexity)], ['Music', fmtScore(p.musicComplexity)], ['Picture', fmtScore(p.pictureComplexity)]]
      : k === 'sync' ? [['Sync', fmtScore(p.sync)], ['Event', fmtScore(p.syncEvent)], ['Continuous', fmtScore(p.syncCont)]]
      : [['Uniqueness', fmtScore(p.uniqueness)]] })),
];

/* ============ 12. STATE & ADDRESS ============
   One state object; every control writes it, then commit() re-renders all
   charts and mirrors non-default values into the address (#…) so a view
   can be linked. Shared: labs, model, labels. Per chart: "<key>.<control>". */
let field = [];
const state = { labs:null, hl:null, lbl:'all', c:{} };
const LBL = ['all','key','none'];
function readHash(){
  const q = new URLSearchParams(location.hash.slice(1));
  state.lbl = LBL.includes(q.get('labels')) ? q.get('labels') : 'all';
  state.hl = q.get('model') || null;
  state.labs = q.get('labs') ? new Set(q.get('labs').split(',')) : null;
  for (const d of CHARTS){
    const c = state.c[d.key] = Object.assign({}, d.defaults);
    for (const k of Object.keys(d.defaults)){ const v = q.get(`${d.key}.${k}`); if (v != null && validFor(d, k, v)) c[k] = v; }
  }
}
function validFor(d, k, v){ return k === 'x' ? d.xOptions.includes(v) : k === 'y' ? d.yOptions.includes(v) : k === 'scale' ? ['log','lin'].includes(v) : k === 'ref' ? ['on','off'].includes(v) : k === 'quad' ? ['auto','on','off'].includes(v) : false; }
function writeHash(){
  const q = new URLSearchParams();
  if (state.labs) q.set('labs', [...state.labs].join(','));
  if (state.hl) q.set('model', state.hl);
  if (state.lbl !== 'all') q.set('labels', state.lbl);
  const linked = new URLSearchParams(location.hash.slice(1)).get('chart');
  if (linked) q.set('chart', linked);
  for (const d of CHARTS) for (const [k, v] of Object.entries(state.c[d.key])) if (v !== d.defaults[k]) q.set(`${d.key}.${k}`, v);
  const s = q.toString().replace(/%2C/g, ',');
  const next = s ? '#' + s : location.pathname + location.search;
  if (location.hash !== (s ? '#' + s : '')) history.pushState(null, '', next);
}
const pieces = () => field;
const labsPresent = () => [...new Map(pieces().map(p => [p.L.slug, p.L])).values()].sort((a, b) => a.slot - b.slot);
const legendLabs = () => labsPresent().filter(L => LEGEND_LABS.includes(L.name));
function visibleSet(){ if (!state.labs) return null; const present = labsPresent().map(L => L.slug).filter(s => state.labs.has(s)); return present.length ? new Set(present) : null; }
const visiblePieces = () => { const v = visibleSet(); return v ? pieces().filter(p => v.has(p.L.slug)) : pieces(); };
const isDirty = () => !!(visibleSet() || state.hl || state.lbl !== 'all' || CHARTS.some(d => Object.entries(state.c[d.key]).some(([k, v]) => v !== d.defaults[k])));
let views = [];
function commit(opts = {}){ writeHash(); toolbar.sync(); views.forEach(v => v.update(opts)); }
addEventListener('hashchange', () => { readHash(); commit(); });

/* ============ 13. CONTROLS (one implementation each, used everywhere) ============ */
const ICON = {
  chev: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>',
  x: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  dl: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13.25h10"/></svg>',
  portrait: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="4" y="2" width="8" height="12" rx="1.5"/></svg>',
  landscape: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="4" width="13" height="8" rx="1.5"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>',
  check: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>',
  quad: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/><rect x="2.5" y="2.5" width="6" height="6" rx="1" fill="currentColor"/></svg>',
  dots: '<svg viewBox="0 0 16 16" width="16" height="12" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="8" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="14" cy="8" r="1.1"/></g></svg>',
};
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
/* Segmented control: role=radiogroup, roving tab stop, arrows move + select. */
function Segmented(name, options, get, set){
  const g = el(`<div class="seg" role="radiogroup" aria-label="${esc(name)}"><span class="k" aria-hidden="true">${esc(name)}</span>${options.map(([v, l]) => `<button type="button" role="radio" data-v="${v}">${esc(l)}</button>`).join('')}</div>`);
  const btns = [...g.querySelectorAll('button')];
  const sync = () => btns.forEach(b => { const on = b.dataset.v === get(); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
  btns.forEach((b, i) => {
    b.addEventListener('click', () => { set(b.dataset.v); });
    b.addEventListener('keydown', e => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault(); const n = btns[(i + d + btns.length) % btns.length]; set(n.dataset.v); n.focus(); });
  });
  sync(); g.sync = sync; return g;
}
/* Select: the native element (keyboard and screen readers for free), dressed. */
function Select(key, name, options, get, set){
  const g = el(`<label class="sel"><span class="k">${esc(key)}</span><select aria-label="${esc(name)}">${options.map(v => `<option value="${v}">${esc(M[v].label)}</option>`).join('')}</select>${ICON.chev}</label>`);
  const s = g.querySelector('select'); s.addEventListener('change', () => set(s.value));
  g.sync = () => { s.value = get(); }; g.sync(); return g;
}
/* Toggle: a pressed/unpressed button. */
function Toggle(label, icon, get, set, avail = () => true){
  const b = el(`<button type="button" class="ctl" aria-pressed="false">${icon}${esc(label)}</button>`);
  b.addEventListener('click', () => set(!get()));
  b.sync = () => { b.setAttribute('aria-pressed', get()); b.hidden = !avail(); }; b.sync(); return b;
}
/* Model search: combobox + listbox; selecting sets the shared highlight. */
function ModelSearch(){
  const id = 'ms-list';
  const g = el(`<div class="combo">${ICON.search}<input type="text" role="combobox" aria-label="Find a model" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}" placeholder="Find a model" spellcheck="false" autocomplete="off"><button type="button" class="x" aria-label="Clear model">${ICON.x}</button><ul class="lb-list" role="listbox" id="${id}"></ul></div>`);
  const input = g.querySelector('input'), list = g.querySelector('ul'), clear = g.querySelector('.x');
  let opts = [], act = -1;
  const all = () => [...new Map(pieces().map(p => [p.id, p])).values()].sort((a, b) => a.full.localeCompare(b.full));
  const open = (o) => { g.classList.toggle('open', o); input.setAttribute('aria-expanded', o); if (!o){ act = -1; input.removeAttribute('aria-activedescendant'); } };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    opts = all().filter(p => !q || p.full.toLowerCase().includes(q) || p.lab.toLowerCase().includes(q)).slice(0, 60);
    list.innerHTML = opts.length ? opts.map((p, i) => `<li role="option" id="ms-${i}" data-id="${esc(p.id)}" aria-selected="${i === act}">${markerIcon(p.L)}${esc(p.full)}</li>`).join('') : '<li class="none" aria-disabled="true">No match</li>';
    if (act >= 0) input.setAttribute('aria-activedescendant', 'ms-' + act);
  };
  const choose = p => { state.hl = p ? p.id : null; input.value = p ? p.full : ''; open(false); commit({ labelsOnly: true }); };
  input.addEventListener('input', () => { act = opts.length ? 0 : -1; render(); act = opts.length ? 0 : -1; render(); open(true); });
  input.addEventListener('focus', () => { if (!state.hl){ render(); } });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); if (!g.classList.contains('open')){ render(); open(true); } act = (act + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % Math.max(opts.length, 1); render(); list.children[act]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter'){ if (g.classList.contains('open') && opts[act]){ e.preventDefault(); choose(opts[act]); } }
    else if (e.key === 'Escape'){ if (g.classList.contains('open')) open(false); else if (state.hl) choose(null); }
  });
  input.addEventListener('blur', () => setTimeout(() => { open(false); g.sync(); }, 120));
  list.addEventListener('pointerdown', e => { const li = e.target.closest('li[data-id]'); if (li){ e.preventDefault(); choose(pieces().find(p => p.id === li.dataset.id)); } });
  clear.addEventListener('click', () => { choose(null); input.focus(); });
  g.sync = () => { const p = state.hl && pieces().find(q => q.id === state.hl); if (document.activeElement !== input) input.value = p ? p.full : ''; g.classList.toggle('has', !!state.hl); };
  g.sync(); return g;
}
/* Legend chips double as the lab filter, shared by every chart.
   Click: isolate when nothing is filtered, otherwise add/remove that lab.
   Alt/Option-click: hide just that lab. Clicking the only shown lab resets. */
function onChip(L, e){
  const all = legendLabs().map(x => x.slug);
  let vis = visibleSet();
  if (e.altKey){ vis = vis || new Set(all); vis.delete(L.slug); }
  else if (!vis) vis = new Set([L.slug]);
  else if (vis.has(L.slug)) vis.delete(L.slug); else vis.add(L.slug);
  state.labs = !vis.size || vis.size === all.length ? null : vis;
  commit();
}
const QUAD_SWATCH = `<svg width="16" height="12" aria-hidden="true"><rect x=".5" y=".5" width="15" height="11" rx="2" fill="${COLOR.quad}" stroke="${COLOR.quadEdge}"/></svg>`;
function Legend(view){
  const g = el(`<div class="legend" role="group" aria-label="Labs"></div>`);
  g.sync = () => {
    const vis = visibleSet(), c = state.c[view.def.key], refOn = view.def.ref && c.ref === 'on', qOn = view.def.cfg && view.def.cfg(c).quad === 'on';
    const refs = (qOn ? `<span class="chip ref">${QUAD_SWATCH}Above median Balance, below median cost</span>` : '') + (refOn ? `<span class="chip ref">${ICON.dots}${esc(view.def.refName)}</span>` : '');
    const focusSlug = document.activeElement && g.contains(document.activeElement) ? document.activeElement.dataset.lab : null;
    g.innerHTML = (refs ? refs + '<span class="lg-break"></span>' : '') + legendLabs().map(L => `<button type="button" class="chip" data-lab="${L.slug}" aria-pressed="${!vis || vis.has(L.slug)}">${markerIcon(L)}${esc(L.name)}</button>`).join('')
      + (vis ? `<button type="button" class="chip reset" data-reset="1">Show all labs</button>` : '');
    g.querySelectorAll('[data-lab]').forEach(b => {
      b.addEventListener('pointerdown', e => { b._touch = e.pointerType !== 'mouse'; });
      b.addEventListener('click', e => {
        const touch = b._touch; b._touch = false;
        if (touch){ view.hoverLab = view.hoverLab === b.dataset.lab ? null : b.dataset.lab; view.stickyLab = !!view.hoverLab; view.applyFocus(); return; }
        onChip(IDS.get(labsPresent().find(L => L.slug === b.dataset.lab).name), e);
      });
    });
    // hovering a lab lights up its models in this chart
    g.querySelectorAll('[data-lab]').forEach(b => {
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse'){ view.hoverLab = b.dataset.lab; view.applyFocus(); } });
      b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && view.hoverLab && !view.stickyLab){ view.hoverLab = null; view.applyFocus(); } });
      b.addEventListener('focus', () => { view.hoverLab = b.dataset.lab; view.applyFocus(); });
      b.addEventListener('blur', () => { if (!view.stickyLab){ view.hoverLab = null; view.applyFocus(); } });
    });
    g.querySelector('[data-reset]')?.addEventListener('click', () => { state.labs = null; commit(); view.legend.querySelector('[data-lab]')?.focus(); });
    if (focusSlug) g.querySelector(`[data-lab="${focusSlug}"]`)?.focus();
  };
  return g;
}
/* Chart options: the wlkr.si mark opens Download PNG, Download SVG and Copy link. */
function ExportMenu(view){
  const g = el(`<div class="xp"><button type="button" class="opt" aria-haspopup="menu" aria-expanded="false" aria-label="Chart options">${brandSvg(16)}</button>
    <div class="menu" role="menu"><button role="menuitem" data-f="png">Download PNG</button><button role="menuitem" data-f="svg">Download SVG</button><button role="menuitem" data-link="1">Copy link</button></div></div>`);
  const btn = g.querySelector('.opt'), items = [...g.querySelectorAll('[role=menuitem]')];
  const open = (o, focusFirst) => { g.classList.toggle('open', o); btn.setAttribute('aria-expanded', o); items.forEach(i => i.tabIndex = -1); if (o && focusFirst) items[0].focus(); };
  const flash = (it, text) => { const prev = it.textContent; it.textContent = text; setTimeout(() => { it.textContent = prev; }, 1400); };
  btn.addEventListener('click', () => open(!g.classList.contains('open'), false));
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(true, true); } });
  g.addEventListener('keydown', e => {
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape'){ open(false); btn.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') open(false);
  });
  document.addEventListener('pointerdown', e => { if (!g.contains(e.target)) open(false); });
  items.forEach(it => it.addEventListener('click', async e => {
    e.preventDefault();
    if (it.dataset.busy) return;
    it.dataset.busy = '1'; setTimeout(() => { delete it.dataset.busy; }, 1000);
    try {
      if (it.dataset.f === 'png'){ download(await exportBlob(view, '4x5'), `bach-bench-${view.slug()}.png`); open(false); btn.focus(); }
      else if (it.dataset.f === 'svg'){ download(new Blob([composeExport(view, '4x5')], { type: 'image/svg+xml' }), `bach-bench-${view.slug()}.svg`); open(false); btn.focus(); }
      else { await navigator.clipboard.writeText(chartLink(view)); flash(it, 'Copied'); setTimeout(() => { open(false); btn.focus(); }, 700); }
    } catch (err){ console.warn('chart option', err); flash(it, 'Couldn’t do that'); }
  }));
  g.open = open; return g;
}
/* A link that reopens this chart in its current view. */
function chartLink(view){
  const q = new URLSearchParams(location.hash.slice(1)); q.set('chart', view.def.key);
  return location.origin + location.pathname + '#' + q.toString().replace(/%2C/g, ',');
}
function download(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

/* Page toolbar: the shared controls (model, label density, reset). */
const toolbar = {
  mount(){
    const bar = document.getElementById('toolbar');
    if (!bar) return;
    this.search = ModelSearch();
    this.reset = el(`<button type="button" class="ctl reset-all">Reset view</button>`);
    this.reset.addEventListener('click', () => { state.labs = null; state.hl = null; state.lbl = 'all'; CHARTS.forEach(d => state.c[d.key] = Object.assign({}, d.defaults)); commit(); });
    bar.append(this.search, el('<span class="grow"></span>'), this.reset);
    this.bar = bar;
  },
  sync(){ if (!this.bar) return; this.search.sync(); this.bar.classList.toggle('dirty', isDirty()); },
};

/* ============ 14. FRAME (page rendering) ============ */
const NS = 'http://www.w3.org/2000/svg';
function cssTokens(){ const S = SIZE.page, r = document.documentElement.style; for (const k of ['title','caption','legend','source']) r.setProperty('--cf-' + k, S[k] + 'px'); }
class ChartView {
  constructor(def){
    this.def = def; this.first = true; this.focusId = null; this.pinned = false;
    const sec = this.sec = el(`<section class="cf" id="chart-${def.key}" aria-labelledby="t-${def.key}">
      <div class="cf-head"><h2 class="cf-title" id="t-${def.key}"><span></span></h2><div class="cf-tools"></div></div>
      <div class="cf-plot"><svg class="pl" xmlns="${NS}" tabindex="0" role="img"><g class="ax"></g><g class="ln"></g><g class="mk"></g><g class="lbl"></g></svg><div class="tip" role="tooltip"></div></div>
      <div class="cf-foot"><p class="cf-cap"></p></div></section>`);
    this.svg = sec.querySelector('svg'); this.L = { ax: sec.querySelector('.ax'), ln: sec.querySelector('.ln'), mk: sec.querySelector('.mk'), lbl: sec.querySelector('.lbl') };
    this.tip = sec.querySelector('.tip'); this.plot = sec.querySelector('.cf-plot');
    const tools = sec.querySelector('.cf-tools'), c = () => state.c[def.key], set = (k, v) => { c()[k] = v; if (c().quad === 'on' && c().y === 'balance' && c().x === 'cost') c().quad = 'auto'; commit(); };
    this.ctls = [];
    for (const k of def.controls){
      let n;
      if (k === 'x') n = Select('X', 'Horizontal axis', def.xOptions, () => c().x, v => set('x', v));
      if (k === 'y') n = Select('Y', 'Vertical axis', def.yOptions, () => c().y, v => set('y', v));
      if (k === 'scale') n = Segmented('Scale', [['log', 'Log'], ['lin', 'Linear']], () => c().scale, v => set('scale', v));
      if (k === 'quad') n = Toggle('Quadrant', ICON.quad, () => quadOn(c()), v => { const auto = c().y === 'balance' && c().x === 'cost'; c().quad = v === auto ? 'auto' : v ? 'on' : 'off'; commit(); }, () => quadAvailable(M[c().x], M[c().y]));
      if (k === 'ref') n = Toggle(def.refName, ICON.dots, () => c().ref === 'on', v => set('ref', v ? 'on' : 'off'));
      tools.append(n); this.ctls.push(n);
    }
    this.xp = ExportMenu(this); sec.querySelector('.cf-head').append(this.xp);
    tools.hidden = !def.controls.length;
    this.legend = Legend(this); sec.querySelector('.cf-head').after(this.legend);
    this.wire();
    new ResizeObserver(() => { const w = this.plot.clientWidth; if (w && w !== this.w) this.update({ resize: true }); }).observe(this.plot);
  }
  slug(){ return slug(this.sec.querySelector('.cf-title span').textContent).slice(0, 40) || this.def.key; }
  ctx(S, w, h, exp = false){ const c = state.c[this.def.key], vis = visiblePieces(); return { S, w, h, exp, field: pieces(), def: this.def, cfg: this.def.cfg ? this.def.cfg(c) : c, pieces: vis, hl: state.hl, density: state.lbl, mustName: state.lbl === 'all' && vis.length <= 25 && (exp || w >= 700) }; }
  update(opts = {}){
    const def = this.def, c = state.c[def.key], w = this.w = this.plot.clientWidth;
    if (!w) return;
    this.sec.querySelector('.cf-title span').textContent = def.title(c);
    this.sec.querySelector('.cf-cap').textContent = def.caption(c);
    this.ctls.forEach(n => n.sync()); this.legend.sync();
    const scene = this.scene = def.render(this.ctx(SIZE.page, w, def.height ? def.height(w) : 0));
    this.svg.setAttribute('width', w); this.svg.setAttribute('height', scene.h); this.svg.setAttribute('viewBox', `0 0 ${w} ${scene.h}`);
    this.svg.setAttribute('aria-label', `${def.title(c)}: ${scene.hits.length} marks. Arrow keys move between Pieces, Enter selects, Escape clears.`);
    this.L.ax.innerHTML = scene.axes; this.L.ln.innerHTML = scene.lines;
    this.join(scene.marks);
    const lbl = this.L.lbl, anim = !reduceMotion.matches && !opts.labelsOnly;
    if (anim){ lbl.classList.add('hide'); clearTimeout(this.lt); }
    lbl.innerHTML = scene.labels;
    if (anim){ this.lt = setTimeout(() => { lbl.getBoundingClientRect(); lbl.classList.remove('hide'); }, this.first ? Math.min(scene.marks.length * MOTION.stagger, MOTION.staggerMax) + 120 : MOTION.move - 60); }
    this.first = false;
    this.applyFocus();
  }
  join(marks){
    const layer = this.L.mk, old = new Map([...layer.children].map(n => [n.dataset.key, n]));
    marks.forEach((m, i) => {
      let n = old.get(m.key); const tf = `translate(${f1(m.X)}px, ${f1(m.Y)}px)`;
      if (n && !n.classList.contains('exit')){ old.delete(m.key); n.style.transform = tf; if (n._h !== m.html){ n.firstChild.innerHTML = m.html; n._h = m.html; } layer.appendChild(n); return; }
      n = document.createElementNS(NS, 'g'); n.setAttribute('class', 'm enter' + (m.row ? ' row' : '')); n.dataset.key = m.key; n.dataset.id = m.id; n.dataset.fam = m.fam;
      n.style.transform = tf; n.innerHTML = `<g class="mi">${m.html}</g>`; n._h = m.html;
      n.style.setProperty('--d', (this.first ? Math.min(i * MOTION.stagger, MOTION.staggerMax) : 0) + 'ms');
      layer.appendChild(n);
      const shown = () => n.classList.remove('enter');
      requestAnimationFrame(() => requestAnimationFrame(shown)); setTimeout(shown, 80); // timer covers throttled frames
    });
    for (const n of old.values()){ if (n.classList.contains('exit')) continue; n.classList.add('exit'); setTimeout(() => n.remove(), MOTION.fade + 60); }
  }
  /* selection state: hover/keyboard focus (local) or the shared highlight */
  applyFocus(){
    this.legend.querySelectorAll('[data-lab]').forEach(b => b.classList.toggle('dim', !!this.hoverLab && b.dataset.lab !== this.hoverLab));
    if (this.hoverLab && !this.focusId){
      const ids = new Set(pieces().filter(p => p.L.slug === this.hoverLab).map(p => p.id));
      this.svg.classList.add('dim');
      this.svg.querySelectorAll('[data-id]').forEach(n => n.classList.toggle('on', ids.has(n.dataset.id)));
      this.tip.classList.remove('show', 'pinned');
      return;
    }
    const id = this.focusId || state.hl, fam = id && (pieces().find(p => p.id === id) || {}).fam;
    this.svg.classList.toggle('dim', !!id && this.scene.hits.some(h => h.id === id));
    this.svg.querySelectorAll('[data-id],[data-fam]').forEach(n => n.classList.toggle('on', !!id && (n.dataset.id === id || (fam && fam.startsWith('f:') && n.dataset.fam === fam))));
    this.L.mk.querySelectorAll('.m').forEach(n => n.classList.toggle('hl', n.dataset.id === state.hl));
    if (this.focusId) this.showTip(this.focusId); else this.tip.classList.remove('show', 'pinned');
  }
  showTip(id){
    const p = pieces().find(q => q.id === id), h = this.scene.hits.find(q => q.id === id); if (!p || !h) return;
    const c = state.c[this.def.key], rows = this.def.tip(p, this.def.cfg ? this.def.cfg(c) : c);
    this.tip.innerHTML = `<div class="who">${markerIcon(p.L)}<span>${esc(p.name)}</span>${p.effort && p.fam.startsWith('f:') ? `<em>${esc(p.effort)}</em>` : ''}</div><div class="ttl">${esc(p.title)}</div>${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}<a href="/p/${encodeURIComponent(p.id)}" target="_blank" rel="noopener" tabindex="-1">Open Piece <span aria-hidden="true">→</span></a>`;
    const ax = h.w ? h.px : h.x, ay = h.w ? h.py : h.y, W = this.plot.clientWidth, H = this.plot.clientHeight;
    this.tip.classList.add('show'); this.tip.classList.toggle('pinned', this.pinned);
    const tw_ = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let x = ax + 14, y = ay - th / 2;
    if (x + tw_ > W) x = ax - tw_ - 14;
    if (x < 0) x = Math.max(0, Math.min(W - tw_, ax - tw_ / 2));
    y = Math.max(-8, Math.min(H - th + 8, y));
    if (x < ax && x + tw_ > ax) y = ay + 14 + th > H ? ay - th - 14 : ay + 14;
    this.tip.style.transform = `translate(${f1(x)}px, ${f1(y)}px)`;
  }
  nearest(px, py){
    let best = null, bd = SIZE.page.hit;
    for (const h of this.scene.hits){
      if (h.w){ if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h; continue; }
      const d = Math.hypot(h.x - px, h.y - py); if (d < bd){ bd = d; best = h; }
    }
    return best;
  }
  wire(){
    const svg = this.svg, pos = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    svg.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || this.pinned) return; const h = this.nearest(...pos(e)); const id = h ? h.id : null; if (id !== this.focusId){ this.focusId = id; this.applyFocus(); } svg.style.cursor = h ? 'pointer' : ''; });
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.pinned){ this.focusId = null; this.applyFocus(); } });
    svg.addEventListener('click', e => {
      const h = this.nearest(...pos(e));
      if (this.stickyLab){ this.stickyLab = false; this.hoverLab = null; }
      if (!h){ this.pinned = false; this.focusId = null; if (state.hl){ state.hl = null; commit({ labelsOnly: true }); } else this.applyFocus(); return; }
      const same = state.hl === h.id; this.pinned = !same; this.focusId = same ? null : h.id; state.hl = same ? null : h.id; commit({ labelsOnly: true });
    });
    // keyboard: one tab stop per plot, arrows walk the marks in reading order
    const order = () => { const seen = new Set(); return this.scene.hits.filter(h => !seen.has(h.id) && seen.add(h.id)).sort((a, b) => (a.w ? a.x - b.x || a.y - b.y : a.x - b.x || a.y - b.y)); };
    svg.addEventListener('keydown', e => {
      const o = order(); if (!o.length) return;
      let i = o.findIndex(h => h.id === this.focusId);
      if (['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){
        e.preventDefault();
        if (e.key === 'Home') i = 0; else if (e.key === 'End') i = o.length - 1;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown'){
          const cur = o[Math.max(i, 0)]; const cands = o.filter(h => (e.key === 'ArrowUp' ? h.y < cur.y - 1 : h.y > cur.y + 1));
          if (i < 0) i = 0; else if (cands.length){ cands.sort((a, b) => Math.hypot((a.x - cur.x) * .5, a.y - cur.y) - Math.hypot((b.x - cur.x) * .5, b.y - cur.y)); i = o.indexOf(cands[0]); }
        } else i = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + o.length) % o.length;
        this.focusId = o[i].id; this.applyFocus();
      } else if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault(); if (!this.focusId) return; const same = state.hl === this.focusId; state.hl = same ? null : this.focusId; commit({ labelsOnly: true });
      } else if (e.key === 'Escape'){ this.pinned = false; this.focusId = null; if (state.hl){ state.hl = null; commit({ labelsOnly: true }); } else this.applyFocus(); }
    });
    svg.addEventListener('blur', () => { if (!this.pinned){ this.focusId = null; this.applyFocus(); } });
    document.addEventListener('pointerdown', e => { if (this.pinned && !this.sec.contains(e.target)){ this.pinned = false; this.focusId = null; this.applyFocus(); } });
  }
}

/* ============ 15. EXPORT (feed rendering of the same primitives) ============
   Same renderer, same state, `SIZE.feed` tokens, fixed canvas. The frame
   pieces mirror the page frame: title, legend chips (only the
   labs currently shown, plus the reference line if on), plot, caption, source. */
function composeExport(view, fmt){
  const F = FORMATS[fmt], S = SIZE.feed, { W, H, pad } = F, def = view.def, c = state.c[def.key];
  let s = `<rect width="${W}" height="${H}" fill="${COLOR.card}"/>`;
  // title, shrunk only if it would not fit
  const title = def.title(c);
  const tSize = Math.min(S.title, S.title * (W - 2 * pad) / tw(title, S.title, 600));
  s += T(pad, pad + tSize * .8, title, { size: f1(tSize), weight: 600, fill: COLOR.ink, ls: f1(-tSize * .02) });
  let y = pad + tSize * 1.05 + S.legend * .9;
  // legend chips
  const vis = visibleSet(), labs = legendLabs().filter(L => !vis || vis.has(L.slug));
  const items = [];
  if (def.cfg && def.cfg(c).quad === 'on') items.push({ quad: true, text: 'Above median Balance, below median cost' });
  if (def.ref && c.ref === 'on') items.push({ ref: true, text: def.refName });
  // the reference keys take their own row so the labs always read together on one line, as on the page
  if (items.length) items.push({ br: true });
  items.push(...labs.map(L => ({ L, text: L.name })));
  if (def.key !== 'words' || true){
    let x = pad; const rowH = S.legend * 1.6, ic = S.legend * .62;
    for (const it of items){
      if (it.br){ x = pad; y += rowH; continue; }
      const wI = ic * 2.2 + S.legend * .35 + tw(it.text, S.legend, 500) + S.legend * 1.1;
      if (x + wI > W - pad && x > pad){ x = pad; y += rowH; }
      const cy = y + S.legend * .5 - S.legend * .5;
      s += it.quad ? `<rect x="${f1(x)}" y="${f1(cy - ic * .8)}" width="${f1(ic * 2.2)}" height="${f1(ic * 1.6)}" rx="${f1(S.hair * 2)}" fill="${COLOR.quad}" stroke="${COLOR.quadEdge}" stroke-width="${S.hair}"/>` : it.ref ? `<line x1="${f1(x)}" y1="${f1(cy)}" x2="${f1(x + ic * 2.2)}" y2="${f1(cy)}" stroke="${COLOR.ref}" stroke-width="${f1(S.line * 1.2)}" stroke-dasharray="0 ${f1(S.line * 3)}" stroke-linecap="round"/>`
        : `<g transform="translate(${f1(x + ic * 1.1)} ${f1(cy)})">${markerSVG(it.L, S, ic * .9, false)}</g>`;
      s += T(x + ic * 2.2 + S.legend * .35, cy + S.legend * .36, it.text, { size: S.legend, weight: 500, fill: it.ref || it.quad ? COLOR.muted : COLOR.text });
      x += wI;
    }
    y += S.legend * 1.2;
  }
  // footer: caption left, brand + source right
  const srcW = Math.max(tw('Bach Bench', S.source * 1.1, 600) + S.source * 1.6, tw('bach.wlkr.si', S.source, 400, true));
  const capLines = wrap(def.caption(c), S.caption, W - 2 * pad - srcW - S.caption * 2, 400, true), lh = S.caption * 1.35;
  const footTop = H - pad - capLines.length * lh;
  capLines.forEach((ln, i) => s += T(pad, footTop + i * lh + S.caption * .95, ln, { size: S.caption, weight: 400, italic: true, fill: COLOR.muted }));
  const by = H - pad - S.source * 1.55;
  s += brandG(W - pad - tw('Bach Bench', S.source * 1.1, 600) - S.source * .85, by - S.source * .38, S.source * 1.15);
  s += T(W - pad, by, 'Bach Bench', { size: f1(S.source * 1.1), weight: 600, fill: COLOR.ink, anchor: 'end' });
  s += T(W - pad, H - pad - S.source * .1, 'bach.wlkr.si', { size: S.source, weight: 400, mono: true, fill: COLOR.faint, anchor: 'end' });
  // plot
  const plotY = y + S.legend * .6, plotH = Math.min(footTop, by - S.source * 1.2) - S.caption * 1.4 - plotY;
  const scene = def.render(view.ctx(S, W - 2 * pad, plotH, true));
  const off = Math.max(0, (plotH - scene.h) / 2) * (def.key === 'words' ? 0 : 1);
  s += `<g transform="translate(${pad} ${f1(plotY + off)})">${scene.axes}${scene.lines}${scene.marks.map(m => `<g transform="translate(${f1(m.X)} ${f1(m.Y)})">${m.html.replace(/<circle class="hlr"[^>]*\/>/, m.id === state.hl ? `<circle r="${f1(S.mk * 2.1)}" fill="none" stroke="${COLOR.ink}" stroke-width="${f1(S.hair * 1.25)}"/>` : '')}</g>`).join('')}${scene.labels}</g>`;
  const fonts = document.getElementById('fontfaces').textContent;
  return `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><style>${fonts}</style></defs>${s}</svg>`;
}
async function exportCanvas(view, fmt){
  const { W, H } = FORMATS[fmt], svg = composeExport(view, fmt);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.drawImage(img, 0, 0); await new Promise(r => setTimeout(r, 50)); g.clearRect(0, 0, W, H); g.drawImage(img, 0, 0);
  URL.revokeObjectURL(url); return c;
}
const exportBlob = async (view, fmt) => { const c = await exportCanvas(view, fmt); return new Promise(r => c.toBlob(r, 'image/png')); };
window.__bach = { exportDataURL: async (key, fmt) => (await exportCanvas(views.find(v => v.def.key === key), fmt)).toDataURL("image/png"), state, get views(){ return views; } };

/* ============ 16. BOOT ============ */
(async () => {
  cssTokens();
  await Promise.all(['500 11px Geist', '600 15px Geist', 'italic 400 12px Geist', '400 10px "Geist Mono"', '500 10px "Geist Mono"'].map(f => document.fonts.load(f)));
  const raw = JSON.parse(document.getElementById('bach-data').textContent);
  const unavailable = document.getElementById('chart-unavailable');
  const detailById = new Map();
  while (detailById.size < raw.pieces.length) {
    // Fetch independently of the Worker and keep each successful read on retry.
    const pending = raw.pieces.filter(({ id }) => !detailById.has(id));
    for (let i = 0; i < pending.length; i += 8) {
      await Promise.allSettled(pending.slice(i, i + 8).map(async ({ id, detailUrl }) => {
        const { scores, measurements } = await readDetail({ slug: id, detailUrl }, raw.revision);
        detailById.set(id, {
          releaseDate: scores.releaseDate,
          thinkingTokens: scores.thinkingTokens,
          outputTokens: scores.outputTokens,
          linesOfCode: scores.linesOfCode,
          musicComplexity: scores.musicComplexity,
          pictureComplexity: scores.pictureComplexity,
          syncEvent: scores.syncMeasures.event.score,
          syncCont: scores.syncMeasures.continuous.score,
          lagMs: scores.syncMeasures.lagMs,
        });
        const note = document.querySelector(`[data-wall-source="${CSS.escape(id)}"]`);
        if (note) note.textContent = provenance(measurements.wallSeconds);
      }));
    }
    if (detailById.size < raw.pieces.length) {
      unavailable.hidden = false;
      await new Promise(resolve => setTimeout(resolve, 15_000));
    }
  }
  unavailable.hidden = true;
  field = prepare({ ...raw, pieces: raw.pieces.map(p => ({ ...p, ...detailById.get(p.id) })) });
  readHash();
  toolbar.mount();
  const root = document.getElementById('charts'), home = root.dataset.set === 'home';
  views = CHARTS.filter(d => !!d.home === home).map(d => new ChartView(d));
  views.forEach(v => root.appendChild(v.sec));
  commit();
  const linked = new URLSearchParams(location.hash.slice(1)).get('chart');
  if (linked) document.getElementById('chart-' + linked)?.scrollIntoView({ block: 'start' });
  document.documentElement.dataset.ready = '1';
})();
