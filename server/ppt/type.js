// 활자 엔진 — 폰트 메트릭(fontkit)으로 줄을 직접 짠다.
// 목적: PDF 와 PPTX 가 같은 줄바꿈·자간·행간을 공유. PowerPoint 의 자동 줄바꿈(한글을 음절 단위로
// 끊음)에 맡기지 않고 어절 단위(keep-all)로 끊고, 제목은 균형 배분(balance), 본문은 외톨이 줄 방지.
// 단위는 전부 pt. 스타일: { f: 페이스 키, s: 크기, c: 색(hex), tr: 자간(em), up: 대문자 }
const path = require('path');
const fontkit = require('fontkit');

const DIR = path.join(__dirname, 'fonts');
// family = PowerPoint 가 부르는 이름(name ID 1). 비-RIBBI 굵기는 패밀리 이름 자체가 다르다.
const FACES = {
  sans:  { file: 'Pretendard-Regular.ttf',     family: 'Pretendard',          pitch: 34 },
  med:   { file: 'Pretendard-Medium.ttf',      family: 'Pretendard Medium',   pitch: 34 },
  semi:  { file: 'Pretendard-SemiBold.ttf',    family: 'Pretendard SemiBold', pitch: 34 },
  mono:  { file: 'JetBrainsMono-Regular.ttf',  family: 'JetBrains Mono',      pitch: 49 },
  serif: { file: 'InstrumentSerif-Italic.ttf', family: 'Instrument Serif',    pitch: 18, italic: true },
};
for (const [k, f] of Object.entries(FACES)) { f.key = k; f.path = path.join(DIR, f.file); }

function face(k) {
  const f = FACES[k];
  if (!f.fk) {
    f.fk = fontkit.openSync(f.path);
    f.upm = f.fk.unitsPerEm;
    f.asc = f.fk.ascent / f.upm;
    f.desc = -f.fk.descent / f.upm;
  }
  return f;
}

const advCache = new Map();
function advance(k, text) {            // em 단위 (자간 제외)
  const key = k + '\u0000' + text;
  let v = advCache.get(key);
  if (v === undefined) { const f = face(k); v = f.fk.layout(text).advanceWidth / f.upm; advCache.set(key, v); }
  return v;
}
const widthOf = (text, st) => advance(st.f, text) * st.s + (st.tr || 0) * st.s * [...text].length;

// 글리프가 없는 글자는 다음 페이스로 (모노/세리프에 한글이 들어와도 두부 글자 없이)
const FALLBACK = ['sans', 'mono'];
function segments(text, st) {
  const out = [];
  let cur = null;
  for (const ch of st.up ? text.toUpperCase() : text) {
    const cp = ch.codePointAt(0);
    let k = st.f;
    if (cp > 0x20 && !face(k).fk.hasGlyphForCodePoint(cp)) k = FALLBACK.find(x => face(x).fk.hasGlyphForCodePoint(cp)) || st.f;
    if (!cur || cur.f !== k) {
      cur = { ...st, f: k, text: '' };
      if (k !== st.f) cur.tr = Math.min(st.tr || 0, 0.02);   // 모노 라벨의 넓은 자간을 한글에 그대로 주면 흩어진다
      out.push(cur);
    }
    cur.text += ch;
  }
  return out;
}

// 문단 → 단어(어절) 목록. 줄은 공백에서만 끊는다. '\n' 은 강제 줄바꿈.
function words(spans) {
  const list = [];
  let wd = null, pendingSpace = null;
  const flush = () => { if (wd) { list.push(wd); wd = null; } };
  for (const sp of spans) {
    for (const seg of segments(String(sp.text ?? ''), sp)) {
      for (const tok of seg.text.split(/(\n|[ \t ]+)/)) {
        if (!tok) continue;
        if (tok === '\n') { flush(); list.push({ br: true }); pendingSpace = null; continue; }
        if (/^[ \t ]+$/.test(tok)) { flush(); pendingSpace = { st: seg, w: widthOf(' ', seg) }; continue; }
        // 홀로 선 대시는 앞 어절에 붙인다 — 줄이 "- 기억할게" 처럼 대시로 시작하지 않게
        const prev = list[list.length - 1];
        if (!wd && /^[-–—]$/.test(tok) && prev && !prev.br) {
          if (pendingSpace) { prev.pieces.push({ text: ' ', st: pendingSpace.st, w: pendingSpace.w }); prev.w += pendingSpace.w; }
          const w = widthOf(tok, seg);
          prev.pieces.push({ text: tok, st: seg, w }); prev.w += w;
          pendingSpace = null;
          continue;
        }
        if (!wd) { wd = { pieces: [], w: 0, space: pendingSpace }; pendingSpace = null; }
        const w = widthOf(tok, seg);
        wd.pieces.push({ text: tok, st: seg, w });
        wd.w += w;
      }
    }
  }
  flush();
  return list;
}

// 한 줄보다 긴 단어는 글자 단위로 쪼갠다 (URL, 긴 합성어)
function splitLong(wd, maxW) {
  const parts = [];
  let cur = { pieces: [], w: 0, space: wd.space };
  for (const p of wd.pieces) {
    for (const ch of p.text) {
      const w = widthOf(ch, p.st);
      if (cur.w + w > maxW && cur.pieces.length) { parts.push(cur); cur = { pieces: [], w: 0, space: null }; }
      const last = cur.pieces[cur.pieces.length - 1];
      if (last && last.st === p.st) { last.text += ch; last.w += w; } else cur.pieces.push({ text: ch, st: p.st, w });
      cur.w += w;
    }
  }
  if (cur.pieces.length) parts.push(cur);
  return parts;
}

function wrap(list, maxW) {
  const lines = [];
  let line = { items: [], w: 0 };
  const push = () => { lines.push(line); line = { items: [], w: 0 }; };
  for (const wd of list) {
    if (wd.br) { push(); continue; }
    const parts = wd.w > maxW ? splitLong(wd, maxW) : [wd];
    for (const p of parts) {
      const sp = line.items.length && p.space ? p.space.w : 0;
      if (line.items.length && line.w + sp + p.w > maxW) push();
      line.w += (line.items.length && p.space ? p.space.w : 0) + p.w;
      line.items.push(p);
    }
  }
  lines.push(line);
  return lines;
}

// 괄호 안에서 줄이 끊기면 읽기가 깨진다 — "이가은(전 After / Schol)" 같은 줄바꿈 금지
function breaksInsideParens(lines) {
  let depth = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    for (const it of lines[i].items) for (const pc of it.pieces) for (const ch of pc.text) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (depth > 0) return true;
  }
  return false;
}
// 균형 배분 — 줄 수는 유지하면서 가장 좁은 폭을 찾는다 (CSS text-wrap: balance 와 같은 발상)
function balanced(list, maxW) {
  const base = wrap(list, maxW);
  if (base.length < 2 || list.some(w => w.br)) return base;
  let lo = maxW * 0.4, hi = maxW;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(list, mid).length <= base.length) hi = mid; else lo = mid;
  }
  // 괄호 안 줄바꿈이면 폭을 넓혀가며 괄호 밖에서 끊기는 배치를 찾는다
  for (let w = hi; w <= maxW + 0.01; w += maxW * 0.02) {
    const t = wrap(list, Math.min(w, maxW));
    if (t.length === base.length && !breaksInsideParens(t)) return t;
  }
  return wrap(list, hi);
}
// 외톨이 줄 방지 — 마지막 줄에 한 어절만 남으면 폭을 조금씩 줄여 앞 줄에서 한 어절을 끌어온다
function noWidow(list, maxW, lines) {
  if (lines.length < 2 || lines[lines.length - 1].items.length > 1 || list.some(w => w.br)) return lines;
  for (let k = 1; k <= 12; k++) {
    const t = wrap(list, maxW * (1 - 0.018 * k));
    if (t.length === lines.length && t[t.length - 1].items.length > 1) return t;
  }
  return lines;
}

const scaleSt = (st, k) => ({ ...st, s: st.s * k });

// 텍스트 블록 조판.
// paras: [{ spans: [{text, ...st}], lead(배수), before(pt), after(pt), align }]
// opts: x, y, w, h(최대 높이), align, valign, balance, widow, fit(넘치면 축소), minScale, maxLines,
//       anchor: 'top' | 'baseline'(y = 첫 줄 베이스라인) | 'last'(y = 마지막 줄 베이스라인)
function block(opts) {
  const { x, y, w, h, align = 'left', valign = 'top', balance = false, widow = true,
          fit = true, minScale = 0.6, maxLines = 0, anchor = 'top' } = opts;
  const paras = opts.paras.filter(p => p && p.spans.some(s => String(s.text ?? '').trim()));

  const run = k => {
    let cursor = 0, lineCount = 0;
    const out = [];
    paras.forEach((p, pi) => {
      const spans = p.spans.map(s => scaleSt(s, k));
      const maxS = Math.max(...spans.map(s => s.s));
      const pitch = (p.lead || 1.3) * maxS;
      const lead0 = face(spans[0].f);
      const list = words(spans);
      let lines = (p.balance ?? balance) ? balanced(list, w) : wrap(list, w);
      if (p.widow ?? widow) lines = noWidow(list, w, lines);
      const before = pi ? (p.before || 0) * k + (paras[pi - 1].after || 0) * k : 0;
      cursor += before;
      const pAlign = p.align || align;
      const laid = lines.map(ln => {
        const top = cursor;
        cursor += pitch;
        lineCount++;
        const base = top + (pitch - (lead0.asc + lead0.desc) * maxS) / 2 + lead0.asc * maxS;
        const frags = [];
        let pen = 0;
        ln.items.forEach((it, ii) => {
          if (ii && it.space) {
            const last = frags[frags.length - 1];
            if (last && last.st === it.space.st) last.text += ' '; else frags.push({ text: ' ', st: it.space.st, x: pen });
            pen += it.space.w;
          }
          for (const pc of it.pieces) {
            const last = frags[frags.length - 1];
            if (last && last.st === pc.st) last.text += pc.text; else frags.push({ text: pc.text, st: pc.st, x: pen });
            pen += pc.w;
          }
        });
        const off = pAlign === 'right' ? w - ln.w : pAlign === 'center' ? (w - ln.w) / 2 : 0;
        return { base, width: ln.w, frags: frags.map(fr => ({ x: x + off + fr.x, text: fr.text, f: fr.st.f, s: fr.st.s, c: fr.st.c, tr: fr.st.tr || 0 })) };
      });
      out.push({ lines: laid, pitch, gap: before, align: pAlign });
    });
    return { out, height: cursor, lineCount };
  };

  let k = 1, r = run(1);
  if (h && fit) while (r.height > h + 0.5 && k > minScale) { k = Math.max(minScale, k * 0.95); r = run(k); }

  // 최대 줄 수 초과 → 말줄임
  if (maxLines && r.lineCount > maxLines) {
    let seen = 0;
    for (const p of r.out) {
      if (seen + p.lines.length > maxLines) {
        p.lines = p.lines.slice(0, Math.max(0, maxLines - seen));
        const ln = p.lines[p.lines.length - 1];
        if (ln) {
          const fr = ln.frags[ln.frags.length - 1];
          const st = { f: fr.f, s: fr.s, tr: fr.tr };
          fr.text = fr.text.replace(/\s+$/, '');
          while (fr.text.length > 1 && fr.x + widthOf(fr.text + '…', st) > x + w) fr.text = fr.text.slice(0, -1).replace(/\s+$/, '');
          fr.text += '…';
        }
      }
      seen += p.lines.length;
    }
    r.out = r.out.filter(p => p.lines.length);
    r.height = r.out.reduce((a, p) => a + p.gap + p.lines.length * p.pitch, 0);
  }

  // 배치 기준점
  const all = r.out.flatMap(p => p.lines);
  let dy = y;
  if (anchor === 'baseline' && all.length) dy = y - all[0].base;
  else if (anchor === 'last' && all.length) dy = y - all[all.length - 1].base;
  else if (h && valign !== 'top') dy = y + (valign === 'bottom' ? h - r.height : (h - r.height) / 2);
  for (const ln of all) ln.base += dy;

  return {
    t: 'text', x, y: dy, w, h: r.height, scale: k, align,
    paras: r.out,
    lastBase: all.length ? all[all.length - 1].base : dy,
    firstBase: all.length ? all[0].base : dy,
    bottom: dy + r.height,
  };
}

// 한 줄 폭 (단순 측정)
function measure(text, st) {
  return segments(String(text), st).reduce((a, sg) => a + widthOf(sg.text, sg), 0);
}
// 글자의 왼쪽 사이드베어링 — 큰 디스플레이 활자를 그리드에 광학적으로 붙일 때
function lsb(ch, st) {
  const f = face(st.f);
  return f.fk.glyphForCodePoint(ch.codePointAt(0)).bbox.minX / f.upm * st.s;
}

module.exports = { FACES, face, block, measure, lsb };
