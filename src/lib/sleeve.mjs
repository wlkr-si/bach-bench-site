export function renderSleeve(input) {
  const { field: FIELD, piece } = input;
  const integer = (n) => Math.round(n).toLocaleString('en-US');
  const METRICS = {
    seconds: { label: 'Time to make', unit: 'sec', get: (p) => p.wall, fmt: integer },
    lines: { label: 'Code', unit: 'lines', get: (p) => p.lines, fmt: integer },
    level: {
      label: 'Loudness',
      unit: '',
      get: (p) => p.level,
      fmt: (n) =>
        n <= -70 ? 'Silent' : n < -24 ? 'Quiet' : n < -14 ? 'Moderate' : 'Loud',
    },
    frames: {
      label: 'Distinct frames',
      unit: '',
      get: (p) => p.frames,
      fmt: integer,
    },
  };
  function domainOf(key) {
    const values = FIELD.map(METRICS[key].get).filter(Number.isFinite);
    const lo = Math.min(...values),
      hi = Math.max(...values);
    return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
  }
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function rgbToHsl(rgb) {
    let [r, g, b] = rgb;
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    let h = 0,
      s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h =
        mx === r
          ? (g - b) / d + (g < b ? 6 : 0)
          : mx === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  // The visual's own color, lifted so it reads on black.
  function lift(hex, minL = 0.62) {
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    return `hsl(${Math.round(h * 360)} ${Math.round(Math.min(1, s * 1.1) * 100)}% ${Math.round(Math.max(l, minL) * 100)}%)`;
  }
  const silentPiece = (p) => !p.env || Math.max(...p.env) <= -60;
  const CW = 1080,
    CH = 1350,
    M = 73;
  const F = (w, s, mono) =>
    `${w} ${s}px ${mono ? '"Geist Mono", ui-monospace, Menlo, monospace' : 'Geist, "Helvetica Neue", Arial, sans-serif'}`;
  const LENS_A = new Path2D(
    'M-87,-5 C-87,-53 -47,-92 1,-92 C49,-92 89,-53 89,-5 C89,3 83,9 75,9 C67,9 61,3 61,-5 C61,-38 34,-64 1,-64 C-32,-64 -59,-38 -59,-5 C-59,3 -65,9 -73,9 C-81,9 -87,3 -87,-5 Z',
  );
  const LENS_B = new Path2D(
    'M-92,24 C-94,17 -89,12 -82,12 H68 C76,12 81,18 79,25 C70,65 35,91 -7,91 C-48,91 -82,64 -92,24 Z',
  );

  function drawMark(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(size / 200, size / 200);
    ctx.rotate((-24 * Math.PI) / 180);
    ctx.fillStyle = '#f7f7f7';
    ctx.save();
    ctx.translate(0, -7);
    ctx.fill(LENS_A);
    ctx.restore();
    ctx.save();
    ctx.translate(0, 8);
    ctx.fill(LENS_B);
    ctx.restore();
    ctx.restore();
  }
  function text(ctx, s, x, y, font, color, align = 'left', spacing = 0) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = spacing + 'px';
    ctx.fillText(s, x, y);
    ctx.letterSpacing = '0px';
  }
  function wrap(ctx, s, maxW) {
    const words = s.split(/\s+/),
      lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function fitTitle(ctx, s, maxW, sizes, maxLines, spacingEm) {
    for (const size of sizes) {
      ctx.font = F(600, size);
      ctx.letterSpacing = size * spacingEm + 'px';
      const lines = wrap(ctx, s, maxW);
      const fits =
        lines.length <= maxLines &&
        lines.every((l) => ctx.measureText(l).width <= maxW);
      ctx.letterSpacing = '0px';
      if (fits) return { size, lines };
    }
    const size = sizes[sizes.length - 1];
    ctx.font = F(600, size);
    return { size, lines: wrap(ctx, s, maxW).slice(0, maxLines) };
  }
  const INK = '#f7f7f7',
    MUTED = '#a0a0a0',
    FAINT = '#6b6b6b',
    LINE = '#262626';
  function hairline(ctx, x, y, w, h) {
    ctx.fillStyle = LINE;
    ctx.fillRect(x, y, w, h);
  }
  // Canvas cannot switch on tabular figures, so digits are set on a fixed
  // advance to keep numbers aligned the way the site's tabular-nums do.
  function measureTabular(ctx, s, font, spacing) {
    ctx.font = font;
    const digit = ctx.measureText('0').width + spacing;
    let w = 0;
    for (const ch of s)
      w += /\d/.test(ch) ? digit : ctx.measureText(ch).width + spacing;
    return w - spacing;
  }
  function tabular(ctx, s, x, y, font, color, align = 'left', spacing = 0) {
    const w = measureTabular(ctx, s, font, spacing);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const digit = ctx.measureText('0').width;
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    for (const ch of s) {
      const cw = ctx.measureText(ch).width;
      const advance = /\d/.test(ch) ? digit : cw;
      ctx.fillText(ch, cx + (advance - cw) / 2, y);
      cx += advance + spacing;
    }
    return w;
  }
  function cardChrome(ctx) {
    ctx.fillStyle = '#010101';
    ctx.fillRect(0, 0, CW, CH);
    drawMark(ctx, M, 70, 40);
    text(ctx, 'Bach Bench', M + 56, 102, F(600, 32), INK, 'left', -0.64);
    text(ctx, 'bach.wlkr.si', CW - M, 102, F(400, 28), MUTED, 'right');
  }
  // big value + small unit, fitted to the column
  function figure(ctx, key, p, x, y, size, unitSize, maxW) {
    const m = METRICS[key],
      v = m.get(p);
    if (v == null) {
      text(ctx, '—', x, y, F(500, size), FAINT);
      return;
    }
    const s = m.fmt(v);
    const gap = unitSize * 0.3;
    let w;
    for (;;) {
      w = measureTabular(ctx, s, F(600, size), -size * 0.04);
      ctx.font = F(400, unitSize);
      const uw = m.unit ? ctx.measureText(m.unit).width + gap : 0;
      if (w + uw <= maxW || size <= 32) break;
      size -= 2;
    }
    tabular(ctx, s, x, y, F(600, size), INK, 'left', -size * 0.04);
    if (m.unit) text(ctx, m.unit, x + w + gap, y, F(400, unitSize), MUTED);
  }
  function cardStrip(ctx, key, p, x, y, w, r) {
    const m = METRICS[key];
    const [lo, hi] = domainOf(key);
    const sx = (v) => x + r + ((v - lo) / (hi - lo)) * (w - 2 * r);
    hairline(ctx, x, y - 1, w, 2);
    FIELD.forEach((q) => {
      const v = m.get(q);
      if (v == null || q.id === p.id) return;
      ctx.beginPath();
      ctx.arc(sx(v), y, 5, 0, 7);
      ctx.fillStyle = '#4d4d4d';
      ctx.fill();
    });
    const v = m.get(p);
    if (v != null) {
      ctx.beginPath();
      ctx.arc(sx(v), y, r + 4, 0, 7);
      ctx.fillStyle = '#010101';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx(v), y, r, 0, 7);
      ctx.fillStyle = '#33f282';
      ctx.fill();
    }
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  // ======================= 1. SLEEVE =======================
  function drawSleeve(ctx, p) {
    cardChrome(ctx);
    const W = CW - 2 * M;
    text(ctx, p.model, M, 220, F(500, 40), MUTED, 'left', -0.4);
    const t = fitTitle(ctx, p.title, W, [128, 116, 104, 92, 80, 68], 2, -0.05);
    const lead = t.size * 0.98;
    const y = 220 + 40 + t.size * 0.78;
    t.lines.forEach((l, i) =>
      text(
        ctx,
        l,
        M - t.size * 0.04,
        y + i * lead,
        F(600, t.size),
        INK,
        'left',
        -t.size * 0.05,
      ),
    );
    const titleEnd = y + (t.lines.length - 1) * lead;

    // the sound's shape, painted in the visual's own colors over time
    const n = p.env?.length ?? 75,
      gap = 4,
      bw = (W - (n - 1) * gap) / n,
      top = titleEnd + 96,
      H = 932 - top,
      mid = top + H / 2;
    hairline(ctx, M, mid - 1, W, 2);
    if (silentPiece(p)) {
      text(ctx, '—', CW / 2, mid - 24, F(500, 30), FAINT, 'center');
    } else {
      const peak = Math.max(...p.env);
      for (let i = 0; i < n; i++) {
        const d =
          p.env[Math.min(p.env.length - 1, Math.floor((i / n) * p.env.length))];
        const h = Math.max(
          3,
          Math.min(1, Math.max(0, (d - peak + 30) / 30)) * (H / 2),
        );
        const c = p.colors
          ? p.colors[
              Math.min(
                p.colors.length - 1,
                Math.floor((i / n) * p.colors.length),
              )
            ][1]
          : '#33f282';
        ctx.fillStyle = lift(c);
        rr(ctx, M + i * (bw + gap), mid - h, bw, h * 2, bw / 2);
        ctx.fill();
      }
    }
    [0, 5, 10, 15].forEach((s) =>
      text(
        ctx,
        s + 's',
        M + (s / 15) * W,
        top + H + 48,
        F(400, 24),
        FAINT,
        s === 0 ? 'left' : s === 15 ? 'right' : 'center',
      ),
    );

    // liner facts, laid out like the site's figures row
    const keys = ['seconds', 'lines', 'level', 'frames'];
    const colW = W / 4,
      pad = 28,
      rowTop = 1050,
      rowBottom = CH - M;
    hairline(ctx, M, rowTop, W, 2);
    hairline(ctx, M, rowBottom - 2, W, 2);
    keys.forEach((k, i) => {
      const x = M + i * colW + (i ? pad : 0);
      const inner = colW - (i ? pad : 0) - pad;
      if (i) hairline(ctx, M + i * colW, rowTop, 2, rowBottom - rowTop);
      text(ctx, METRICS[k].label, x, rowTop + 62, F(400, 26), MUTED);
      figure(ctx, k, p, x, rowTop + 140, 64, 26, inner);
      cardStrip(ctx, k, p, x, rowTop + 190, inner, 8);
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  drawSleeve(context, piece);
  return canvas.toDataURL('image/png').split(',')[1];
}
