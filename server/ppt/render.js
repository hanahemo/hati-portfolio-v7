// 스펙 → PDF / PPTX. 두 렌더러는 type.js 가 이미 짠 줄을 그대로 옮겨 그린다 (줄바꿈 재계산 없음).
// 스펙 단위는 pt (960 × 540 = 13.333 × 7.5in).
// 요소: text(type.block 결과) | img {data:Buffer, mime} | rule {x1,y1,x2,y2,c,w} | rect {x,y,w,h,c} | link {x,y,w,h,url|page}
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');
const fontkit = require('fontkit');
const fs = require('fs');
const { FACES } = require('./type');

const IN = v => v / 72;
const CLEAR_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';   // 1×1 투명

// ═══════════════ PDF (pdfkit — 폰트 서브셋 임베딩, 벡터 텍스트, 목차 북마크, 내부 링크) ═══════════════
function renderPdf(deck) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [deck.W, deck.H], margin: 0, autoFirstPage: false, compress: true, lang: 'ko-KR', displayTitle: true,
      info: { Title: deck.title, Author: 'Hati', Subject: deck.subject || '', Creator: 'hatist.studio', Producer: 'hatist.studio' },
    });
    const bufs = [];
    doc.on('data', b => bufs.push(b));
    doc.on('end', () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);
    for (const [k, f] of Object.entries(FACES)) doc.registerFont(k, f.path);

    deck.slides.forEach((sl, i) => {
      doc.addPage({ size: [deck.W, deck.H], margin: 0 });
      doc.addNamedDestination('p' + (i + 1), 'XYZ', 0, deck.H, null);
      doc.rect(0, 0, deck.W, deck.H).fill('#' + sl.bg);
      for (const el of sl.els) {
        if (el.t === 'img') doc.image(el.data, el.x, el.y, { width: el.w, height: el.h });
        else if (el.t === 'rect') doc.rect(el.x, el.y, el.w, el.h).fill('#' + el.c);
        else if (el.t === 'rule') doc.save().moveTo(el.x1, el.y1).lineTo(el.x2, el.y2).lineWidth(el.w || 0.5).strokeColor('#' + el.c).stroke().restore();
        else if (el.t === 'link') { if (el.url) doc.link(el.x, el.y, el.w, el.h, el.url); else if (el.page) doc.goTo(el.x, el.y, el.w, el.h, 'p' + el.page); }
        else if (el.t === 'text') {
          for (const p of el.paras) for (const ln of p.lines) for (const fr of ln.frags) {
            if (!fr.text.trim()) continue;
            doc.font(fr.f).fontSize(fr.s).fillColor('#' + fr.c)
              .text(fr.text, fr.x, ln.base, { lineBreak: false, characterSpacing: fr.tr * fr.s, baseline: 'alphabetic' });
          }
        }
      }
      if (sl.outline) doc.outline.addItem(sl.outline);
    });
    doc.end();
  });
}

// ═══════════════ PPTX (pptxgenjs + 폰트 임베딩 후처리) ═══════════════
async function renderPptx(deck) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'HATI', width: IN(deck.W), height: IN(deck.H) });
  pptx.layout = 'HATI';
  pptx.author = 'Hati';
  pptx.company = 'Hati';
  pptx.title = deck.title;
  pptx.theme = { headFontFace: FACES.semi.family, bodyFontFace: FACES.sans.family };

  const used = {};   // 페이스별 사용 글자 — 임베딩 서브셋 범위
  const note = (k, t) => { (used[k] = used[k] || new Set()); for (const ch of t) used[k].add(ch); };

  for (const sl of deck.slides) {
    const s = pptx.addSlide();
    s.background = { color: sl.bg };
    for (const el of sl.els) {
      if (el.t === 'img') {
        s.addImage({ data: `data:${el.mime || 'image/jpeg'};base64,${el.data.toString('base64')}`, x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h) });
      } else if (el.t === 'rect') {
        s.addShape(pptx.ShapeType.rect, { x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h), fill: { color: el.c }, line: { type: 'none' } });
      } else if (el.t === 'rule') {
        s.addShape(pptx.ShapeType.line, {
          x: IN(Math.min(el.x1, el.x2)), y: IN(Math.min(el.y1, el.y2)),
          w: IN(Math.abs(el.x2 - el.x1)), h: IN(Math.abs(el.y2 - el.y1)),
          line: { color: el.c, width: el.w || 0.5 },
        });
      } else if (el.t === 'link') {
        // 텍스트 하이퍼링크는 PowerPoint 가 파란 밑줄을 강제 → 투명 이미지에 링크를 건다
        s.addImage({ data: CLEAR_PNG, x: IN(el.x), y: IN(el.y), w: IN(el.w), h: IN(el.h), hyperlink: el.url ? { url: el.url } : { slide: el.page } });
      } else if (el.t === 'text') {
        const runs = [];
        el.paras.forEach((p, pi) => {
          p.lines.forEach((ln, li) => {
            const frags = ln.frags.filter((fr, fi, arr) => fr.text.trim() || (fi > 0 && fi < arr.length - 1));
            frags.forEach((fr, fi) => {
              const F = FACES[fr.f];
              note(fr.f, fr.text);
              const o = {
                fontFace: F.family, fontSize: +fr.s.toFixed(2), color: fr.c, lang: 'ko-KR',
                align: p.align, lineSpacing: +p.pitch.toFixed(2),
              };
              if (F.italic) o.italic = true;
              if (fr.tr) o.charSpacing = +(fr.tr * fr.s).toFixed(2);
              if (pi && !li && !fi && p.gap) o.paraSpaceBefore = +p.gap.toFixed(2);
              if (li && !fi) o.softBreakBefore = true;
              runs.push({ text: fr.text, options: o });
            });
          });
          if (runs.length && pi < el.paras.length - 1) runs[runs.length - 1].options.breakLine = true;
        });
        if (!runs.length) continue;
        // 줄은 이미 확정 — 폴백 폰트로 열려도 재줄바꿈이 덜 일어나게 정렬 반대쪽으로 여유 폭을 준다
        const slack = Math.max(6, el.w * 0.05);
        const bx = el.align === 'right' ? el.x - slack : el.align === 'center' ? el.x - slack / 2 : el.x;
        const firstPitch = el.paras[0].pitch;
        s.addText(runs, {
          x: IN(bx), y: IN(el.y), w: IN(el.w + slack), h: IN(Math.max(el.h, firstPitch)),
          inset: 0, valign: 'top', wrap: true, fit: 'none', align: el.align,
        });
      }
    }
  }

  const buf = await pptx.write({ outputType: 'nodebuffer' });
  return embedFonts(buf, used);
}

// pptxgenjs 는 한 문단 안에서 런마다 <a:pPr> 를 다시 쓴다(<a:br/> 뒤 포함) — 스키마 위반이라
// PowerPoint 가 '복구' 경고를 띄운다. 문단 첫 pPr 만 남기고, 커닝은 PDF 와 같게 전 런에 켠다.
function cleanSlideXml(xml) {
  return xml
    .replace(/<a:p>([\s\S]*?)<\/a:p>/g, (m, body) => {
      let seen = false;
      const fixed = body.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, pp => {
        if (seen) return '';
        seen = true;
        return pp;
      });
      return `<a:p>${fixed}</a:p>`;
    })
    .replace(/<a:rPr (?![^>]*\bkern=)/g, '<a:rPr kern="0" ');
}

// ── 폰트 임베딩: 사용 글자만 서브셋 → EOT(.fntdata, PowerPoint 가 쓰는 컨테이너) 로 싸서 ppt/fonts 에 ──
// 받는 사람 PC 에 Pretendard 가 없어도 PowerPoint(Win / Mac 16.17+)는 설계된 서체로 연다.
async function embedFonts(buf, used) {
  let subsetFont = null;
  try { subsetFont = require('subset-font'); } catch (_) { /* 서브셋터가 없으면 임베딩 없이 */ }
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    zip.file(name, cleanSlideXml(await zip.file(name).async('string')));
  }
  let rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  let pres = await zip.file('ppt/presentation.xml').async('string');
  let ct = await zip.file('[Content_Types].xml').async('string');

  const lst = [];
  let n = 0;
  for (const [k, chars] of Object.entries(subsetFont ? used : {})) {
    const F = FACES[k];
    try {
      const sub = await subsetFont(fs.readFileSync(F.path), [...chars].join('') + ' ', { targetFormat: 'truetype' });
      n++;
      zip.file(`ppt/fonts/font${n}.fntdata`, toEot(sub));
      rels = rels.replace('</Relationships>', `<Relationship Id="rIdHatiFont${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font${n}.fntdata"/></Relationships>`);
      lst.push(`<p:embeddedFont><p:font typeface="${F.family}" pitchFamily="${F.pitch}" charset="0"/><p:${F.italic ? 'italic' : 'regular'} r:id="rIdHatiFont${n}"/></p:embeddedFont>`);
    } catch (_) { /* 이 페이스만 임베딩 생략 */ }
  }
  if (lst.length) pres = pres
    .replace(/(<p:notesSz[^>]*\/>)/, `$1<p:embeddedFontLst>${lst.join('')}</p:embeddedFontLst>`)
    .replace('<p:presentation ', '<p:presentation embedTrueTypeFonts="1" saveSubsetFonts="1" ');
  if (lst.length && !ct.includes('Extension="fntdata"')) ct = ct.replace('<Default ', '<Default Extension="fntdata" ContentType="application/x-fontdata"/><Default ');
  zip.file('ppt/_rels/presentation.xml.rels', rels);
  zip.file('ppt/presentation.xml', pres);
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// Embedded OpenType v2.1 (W3C EOT 제출문서) — 무압축(Flags 0), 헤더 리틀엔디언 + TTF 원본.
function toEot(ttf) {
  const f = fontkit.create(ttf);
  const os2 = f['OS/2'];
  const fs2 = os2.fsType || {};
  const fsType = (fs2.noEmbedding ? 0x2 : 0) | (fs2.viewOnly ? 0x4 : 0) | (fs2.editable ? 0x8 : 0) | (fs2.noSubsetting ? 0x100 : 0) | (fs2.bitmapOnly ? 0x200 : 0);
  const utf16 = s => Buffer.from(String(s || ''), 'utf16le');
  const names = [f.familyName, f.subfamilyName, (f.name.records.version || {}).en || '', f.fullName].map(utf16);

  const fixed = Buffer.alloc(82);
  let o = 0;
  const u32 = v => { fixed.writeUInt32LE(v >>> 0, o); o += 4; };
  const u16 = v => { fixed.writeUInt16LE(v & 0xffff, o); o += 2; };
  const u8 = v => { fixed.writeUInt8(v & 0xff, o); o += 1; };
  u32(0); u32(ttf.length); u32(0x00020001); u32(0);                      // EOTSize(나중에), FontDataSize, Version, Flags
  (os2.panose || []).concat(Array(10).fill(0)).slice(0, 10).forEach(u8);   // PANOSE
  u8(1);                                                                    // Charset = DEFAULT_CHARSET
  u8(os2.fsSelection && os2.fsSelection.italic ? 1 : 0);
  u32(os2.usWeightClass || 400);
  u16(fsType);
  u16(0x504c);                                                              // MagicNumber
  (os2.ulCharRange || [0, 0, 0, 0]).slice(0, 4).forEach(u32);
  (os2.codePageRange || [0, 0]).slice(0, 2).forEach(u32);
  u32(f.head.checkSumAdjustment);
  u32(0); u32(0); u32(0); u32(0);                                           // Reserved1-4
  u16(0);                                                                   // Padding1

  const parts = [fixed];
  names.forEach((nb, i) => {
    const sz = Buffer.alloc(2); sz.writeUInt16LE(nb.length); parts.push(sz, nb);
    parts.push(Buffer.alloc(2));                                            // Padding2..4 / Padding5
  });
  const root = Buffer.alloc(2); root.writeUInt16LE(0); parts.push(root);    // RootStringSize = 0
  parts.push(ttf);
  const out = Buffer.concat(parts);
  out.writeUInt32LE(out.length, 0);
  return out;
}

module.exports = { renderPdf, renderPptx, toEot };
