/* Mi aventura · importador
 * Convierte notas con el formato «7 Febrero - Plan🎉 + Otro plan🍻» en días.
 * Fuentes: .docx (con formato), HTML pegado (con formato) o texto plano.
 * Formato → significado:
 *   negrita   → plan hasta tarde (pasadas las 00:00)
 *   cursiva   → examen, o viaje si son varios días seguidos enteros en cursiva con emojis
 *   resaltado → plan destacado
 */
(function () {
  'use strict';

  const MONTHS = {
    enero: 1, ene: 1, gener: 1, gen: 1,
    febrero: 2, feb: 2, febrer: 2,
    marzo: 3, mar: 3, marc: 3,
    abril: 4, abr: 4,
    mayo: 5, may: 5, maig: 5,
    junio: 6, jun: 6, juny: 6,
    julio: 7, jul: 7, juliol: 7,
    agosto: 8, ago: 8, agost: 8,
    septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, setembre: 9,
    octubre: 10, oct: 10,
    noviembre: 11, nov: 11, novembre: 11,
    diciembre: 12, dic: 12, desembre: 12, des: 12,
  };

  const DATE_RE = /^\s*(\d{1,2})\s*(?:de\s+)?([A-Za-zÀ-ÿ]+)\.?\s*(?:[-–—:]\s*|$)/;
  const CONTENT_RE = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;
  const WORD_RE = /[\p{L}\p{N}]/u;
  const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

  const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- ZIP mínimo para leer word/document.xml ---------- */
  async function unzipEntry(buf, wanted) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo no parece un .docx válido.');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
      if (name === wanted) {
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const data = u8.subarray(start, start + csize);
        if (method === 0) return dec.decode(data);
        if (method === 8) {
          if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede abrir .docx. Prueba con Chrome, Edge, Safari o Firefox actualizados.');
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return await new Response(stream).text();
        }
        throw new Error('Compresión no soportada en el .docx.');
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('No se encontró el texto dentro del .docx.');
  }

  /* ---------- Fuentes → párrafos de segmentos {t, b, i, h} ---------- */
  async function docxToParagraphs(buf) {
    const xml = await unzipEntry(buf, 'word/document.xml');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const child = (el, name) => {
      for (const c of el.children) if (c.localName === name) return c;
      return null;
    };
    const on = (rPr, name) => {
      const e = rPr && child(rPr, name);
      if (!e) return false;
      const v = e.getAttributeNS(W, 'val') ?? e.getAttribute('w:val');
      return v == null || !['0', 'false', 'none', 'off'].includes(v);
    };
    const shaded = (rPr) => {
      const e = rPr && child(rPr, 'shd');
      if (!e) return false;
      const fill = (e.getAttributeNS(W, 'fill') ?? e.getAttribute('w:fill') ?? '').toLowerCase();
      return fill && fill !== 'auto' && fill !== 'ffffff';
    };
    const paras = [];
    for (const p of doc.getElementsByTagNameNS(W, 'p')) {
      const segs = [];
      for (const r of p.getElementsByTagNameNS(W, 'r')) {
        const rPr = child(r, 'rPr');
        let t = '';
        for (const c of r.children) {
          if (c.localName === 't') t += c.textContent;
          else if (c.localName === 'tab') t += ' ';
        }
        if (t) segs.push({ t, b: on(rPr, 'b'), i: on(rPr, 'i'), h: on(rPr, 'highlight') || shaded(rPr) });
      }
      paras.push(segs);
    }
    return paras;
  }

  const BLOCK = /^(P|DIV|LI|H[1-6]|TR|BLOCKQUOTE|UL|OL|TABLE|SECTION|ARTICLE|PRE)$/;
  const NO_BG = /^(|transparent|initial|inherit|none|white|#fff|#ffffff|rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|rgb\(\s*255,\s*255,\s*255\s*\))$/i;

  function htmlToParagraphs(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const paras = [];
    let cur = [];
    const flush = () => { paras.push(cur); cur = []; };
    const walk = (node, f) => {
      if (node.nodeType === 3) {
        const t = node.nodeValue.replace(/[\r\n]+/g, ' ');
        if (t) cur.push({ t, b: f.b, i: f.i, h: f.h });
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'BR') { flush(); return; }
      if (/^(STYLE|SCRIPT|HEAD|META|TITLE)$/.test(tag)) return;
      const g = { ...f };
      if (tag === 'B' || tag === 'STRONG') g.b = true;
      if (tag === 'I' || tag === 'EM') g.i = true;
      if (tag === 'MARK') g.h = true;
      const st = node.style;
      if (st) {
        const fw = st.fontWeight;
        if (fw === 'bold' || fw === 'bolder' || +fw >= 600) g.b = true;
        else if (fw === 'normal' || (+fw && +fw < 600)) g.b = false;
        if (st.fontStyle === 'italic' || st.fontStyle === 'oblique') g.i = true;
        else if (st.fontStyle === 'normal') g.i = false;
        const bg = (st.backgroundColor || '').trim();
        if (bg && !NO_BG.test(bg)) g.h = true;
      }
      const block = BLOCK.test(tag);
      if (block && cur.length) flush();
      for (const c of node.childNodes) walk(c, g);
      if (block) flush();
    };
    walk(doc.body, { b: false, i: false, h: false });
    flush();
    return paras.filter((p) => p.length);
  }

  // Texto plano. Entiende las marcas de «Ver como texto»: *noche*, _examen_, ==destacado==
  function textToParagraphs(text) {
    return text.split(/\r?\n/).map((line) => {
      const segs = [];
      const f = { b: false, i: false, h: false };
      let buf = '';
      const flush = () => { if (buf) segs.push({ t: buf, ...f }); buf = ''; };
      for (let k = 0; k < line.length; k++) {
        if (line.startsWith('==', k)) { flush(); f.h = !f.h; k++; }
        else if (line[k] === '*') { flush(); f.b = !f.b; }
        else if (line[k] === '_') { flush(); f.i = !f.i; }
        else buf += line[k];
      }
      flush();
      return segs.length ? segs : [{ t: '', b: false, i: false, h: false }];
    });
  }

  const TRIP_TAG = /\s*\[viaje(?::\s*([^\]]*))?\]\s*$/i;

  /* ---------- Párrafos → días ---------- */
  function analyse(paragraphs, fallbackYear) {
    let year = fallbackYear;
    const found = [];
    const skipped = [];
    for (const segs of paragraphs) {
      const text = segs.map((s) => s.t).join('');
      const trimmed = text.trim();
      if (!trimmed) continue;
      const ym = trimmed.match(/^(?:año\s+)?(\d{4})[:.]?$/i);
      if (ym) { year = +ym[1]; continue; }
      const m = text.match(DATE_RE);
      const month = m && MONTHS[norm(m[2])];
      if (!m || !month) { skipped.push(trimmed); continue; }
      const day = +m[1];
      const probe = new Date(year, month - 1, day);
      if (probe.getMonth() !== month - 1) { skipped.push(trimmed); continue; }

      // Formato carácter a carácter
      const chars = [];
      for (const s of segs) for (const ch of s.t) chars.push({ ch, b: s.b, i: s.i, h: s.h });
      const prefixLen = [...m[0]].length;
      const prefix = chars.slice(0, prefixLen);
      let body = chars.slice(prefixLen);
      let bodyText = body.map((c) => c.ch).join('');
      let tripTag = null;
      const tm = bodyText.match(TRIP_TAG);
      if (tm) {
        tripTag = (tm[1] || '').trim() || true;
        body = body.slice(0, [...bodyText.slice(0, tm.index)].length);
        bodyText = bodyText.slice(0, tm.index);
      }
      if (!CONTENT_RE.test(bodyText)) continue; // día vacío o «/»

      const dateItalic = prefix.some((c) => c.i && WORD_RE.test(c.ch));
      const plans = [];
      let cur = [];
      const pushPlan = () => {
        const t = cur.map((c) => c.ch).join('').trim();
        if (CONTENT_RE.test(t)) {
          const solid = cur.filter((c) => c.ch.trim() && c.ch !== '+');
          const words = solid.filter((c) => WORD_RE.test(c.ch));
          plans.push({
            t,
            late: solid.some((c) => c.b),
            star: solid.some((c) => c.h),
            ital: words.some((c) => c.i),
            hasWords: words.length > 0,
          });
        }
        cur = [];
      };
      for (const c of body) {
        if (c.ch === '+') pushPlan();
        else cur.push(c);
      }
      pushPlan();
      if (!plans.length) continue;

      found.push({
        date: `${year}-${pad(month)}-${pad(day)}`,
        plans,
        dateItalic,
        allItalic: dateItalic || plans.every((p) => !p.hasWords || p.ital),
        hasEmoji: EMOJI_RE.test(bodyText),
        tripTag,
      });
    }

    // Juntar líneas repetidas del mismo día
    const byDate = new Map();
    for (const f of found) {
      const prev = byDate.get(f.date);
      if (prev) {
        prev.plans.push(...f.plans);
        prev.dateItalic ||= f.dateItalic;
        prev.allItalic &&= f.allItalic;
        prev.hasEmoji ||= f.hasEmoji;
        prev.tripTag ||= f.tripTag;
      } else byDate.set(f.date, f);
    }
    const list = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    // Viajes: tramos de días seguidos en cursiva entera con emojis
    const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
    let i = 0;
    while (i < list.length) {
      if (!list[i].allItalic) { i++; continue; }
      let j = i;
      while (j + 1 < list.length && list[j + 1].allItalic && dayNum(list[j + 1].date) - dayNum(list[j].date) === 1) j++;
      const run = list.slice(i, j + 1);
      const emojiDays = run.filter((d) => d.hasEmoji).length;
      const isTrip = run.some((d) => d.dateItalic) || (run.length >= 2 && emojiDays * 2 >= run.length);
      if (isTrip) run.forEach((d) => { d.trip = true; });
      i = j + 1;
    }
    for (const d of list) if (d.tripTag) d.trip = d.tripTag;

    const days = {};
    for (const d of list) {
      const entry = {
        plans: d.plans.map((p) => {
          const plan = { t: p.t };
          if (p.late) plan.late = true;
          if (p.star) plan.star = true;
          if (p.ital && !d.trip) plan.exam = true;
          return plan;
        }),
      };
      if (d.trip) entry.trip = d.trip;
      days[d.date] = entry;
    }
    return { days, skipped };
  }

  window.Importer = {
    docxToParagraphs,
    htmlToParagraphs,
    textToParagraphs,
    analyse,
  };
})();
