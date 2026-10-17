/* Mi aventura · app */
(function () {
  'use strict';

  const KEY = 'mi-aventura:data';
  const PREFS_KEY = 'mi-aventura:prefs';
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const WD_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DEFAULT_EMOJIS = ['🍻', '🍕', '🎉', '🥳', '🎬', '🍿', '🏖️', '⚽', '🎂', '🎁', '🚗', '🛫', '🎶', '🕺🏻', '🪩', '🗣️', '😭', '😂', '🍣', '☕'];
  const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
  const EMOJI_STRIP = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu;

  /* ---------- utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const parts = (iso) => [+iso.slice(0, 4), +iso.slice(5, 7), +iso.slice(8, 10)];
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const dayNum = (s) => { const [y, m, d] = parts(s); return Date.UTC(y, m - 1, d) / 864e5; };
  const weekday = (s) => { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const addDays = (s, n) => {
    const [y, m, d] = parts(s);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };
  const todayISO = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const fmtLong = (s) => { const [y, m, d] = parts(s); return `${WD_LONG[weekday(s)]}, ${d} de ${MONTHS[m - 1].toLowerCase()} de ${y}`; };
  const fmtShort = (s) => { const [, m, d] = parts(s); return `${d} ${MONTHS_SHORT[m - 1]}`; };
  const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ---------- datos ---------- */
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.days && typeof d.days === 'object') return d;
    } catch (e) { /* datos corruptos: empezar vacío */ }
    return { app: 'mi-aventura', version: 1, days: {} };
  }
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  let data = load();
  let prefs = loadPrefs();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { toast('No se ha podido guardar en este dispositivo'); }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* sin preferencias */ }
  }

  const allKeys = () => Object.keys(data.days).sort();
  const yearKeys = (y) => allKeys().filter((k) => k.startsWith(y + '-'));
  const isLate = (e) => e.plans.some((p) => p.late);
  const hasFlag = (e, f) => (f === 'trip' ? !!e.trip : e.plans.some((p) => p[f]));
  const category = (e) => (e.trip ? 'trip' : hasFlag(e, 'exam') ? 'exam' : hasFlag(e, 'star') ? 'star' : isLate(e) ? 'late' : 'has');
  const entryText = (e) => e.plans.map((p) => p.t).join(' + ');

  function tripInfo() {
    const keys = allKeys().filter((k) => data.days[k].trip);
    const info = {};
    let run = [];
    const close = () => {
      if (!run.length) return;
      const name = run.map((k) => (typeof data.days[k].trip === 'string' ? data.days[k].trip : '')).find(Boolean) || '';
      const r = { start: run[0], end: run[run.length - 1], len: run.length, name };
      run.forEach((k) => { info[k] = r; });
      run = [];
    };
    for (const k of keys) {
      if (run.length && dayNum(k) - dayNum(run[run.length - 1]) !== 1) close();
      run.push(k);
    }
    close();
    return info;
  }

  function yearRange() {
    const cy = new Date().getFullYear();
    const ys = allKeys().map((k) => +k.slice(0, 4));
    return [Math.min(cy, ...ys), Math.max(cy, ...ys)];
  }

  /* ---------- estado de la interfaz ---------- */
  let view = 'diario';
  let year = new Date().getFullYear();
  let query = '';
  const filters = new Set();
  let peekDate = null;

  /* ---------- piezas de HTML ---------- */
  function highlight(text, q) {
    if (!q) return esc(text);
    let n = '';
    const map = [];
    for (let i = 0; i < text.length; i++) {
      for (const ch of norm(text[i])) { n += ch; map.push(i); }
    }
    let out = '';
    let last = 0;
    let at = n.indexOf(q);
    while (at !== -1) {
      const s = map[at];
      const e = map[at + q.length - 1] + 1;
      if (s >= last) {
        out += esc(text.slice(last, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>';
        last = e;
      }
      at = n.indexOf(q, at + q.length);
    }
    return out + esc(text.slice(last));
  }

  function planHTML(p, q) {
    const cls = ['plan'];
    if (p.late) cls.push('late');
    if (p.star) cls.push('star');
    if (p.exam) cls.push('exam');
    return `<span class="${cls.join(' ')}">${p.exam ? icon('cap', 'mk') : ''}${highlight(p.t, q)}${p.late ? icon('moon', 'mk') : ''}</span>`;
  }
  const plansHTML = (e, q) => e.plans.map((p) => planHTML(p, q)).join('<span class="sep">+</span>');

  function dayHTML(k, e, opts = {}) {
    const [, , d] = parts(k);
    const wd = weekday(k);
    const t = todayISO();
    const cls = ['day'];
    if (k > t) cls.push('future');
    if (k === t) cls.push('is-today');
    if (wd === 0 || wd === 6) cls.push('weekend');
    if (opts.tripMark && e.trip) cls.push('trip-mark');
    return `<article class="${cls.join(' ')}" data-date="${k}" tabindex="0" role="button" aria-label="${esc(fmtLong(k))}">
      <div class="d-date"><span class="d-num">${d}</span><span class="d-wd">${WD[wd]}</span></div>
      <div class="d-plans">${opts.tripMark && e.trip ? icon('plane', 'trip-ico') : ''}${plansHTML(e, opts.q)}</div>
    </article>`;
  }

  function tripHeadHTML(r) {
    const range = r.start === r.end ? fmtShort(r.start) : `${fmtShort(r.start)} – ${fmtShort(r.end)}`;
    return `<div class="trip-head">${icon('plane')}<strong>${esc(r.name || 'Viaje')}</strong><span>${range} · ${plural(r.len, 'día', 'días')}</span></div>`;
  }

  /* ---------- Diario ---------- */
  function renderDiario() {
    const root = $('#view-diario');
    if (query || filters.size) { renderSearch(root); return; }
    const t = todayISO();
    const [ty, tm] = parts(t);
    const keys = yearKeys(year);
    let html = onThisDayHTML();
    if (!keys.length) {
      root.innerHTML = html + emptyHTML();
      return;
    }
    const trips = tripInfo();
    const byMonth = new Map();
    for (const k of keys) {
      const m = +k.slice(5, 7);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(k);
    }
    let placed = year !== ty;
    const todayMark = () => {
      placed = true;
      const has = !!data.days[t];
      return `<div class="today-mark" id="today-mark"><span class="tm-line"></span><span class="tm-label">Hoy · ${fmtShort(t)}</span>${has ? '' : `<button class="tm-add" data-add="${t}">${icon('plus')}¿Algo que contar?</button>`}<span class="tm-line"></span></div>`;
    };
    for (const [m, list] of byMonth) {
      if (!placed && m > tm) html += todayMark();
      const late = list.filter((k) => isLate(data.days[k])).length;
      html += `<section class="month" id="m-${year}-${pad(m)}" data-month="${m}">
        <header class="month-head"><h2>${MONTHS[m - 1]}</h2><p>${plural(list.length, 'día', 'días')}${late ? ` · ${icon('moon', 'mh-ico')}${late}` : ''}</p></header>`;
      let i = 0;
      while (i < list.length) {
        const k = list[i];
        if (!placed && k >= t) html += todayMark();
        const r = trips[k];
        if (r) {
          html += `<div class="trip-group">${tripHeadHTML(r)}`;
          while (i < list.length && trips[list[i]] === r) {
            if (!placed && list[i] >= t) html += todayMark();
            html += dayHTML(list[i], data.days[list[i]]);
            i++;
          }
          html += '</div>';
        } else {
          html += dayHTML(k, data.days[k]);
          i++;
        }
      }
      html += '</section>';
    }
    if (!placed) html += todayMark();
    root.innerHTML = html;
  }

  function onThisDayHTML() {
    const t = todayISO();
    if (year !== +t.slice(0, 4)) return '';
    const md = t.slice(5);
    const hits = allKeys().filter((k) => k.slice(5) === md && k < t).reverse();
    if (!hits.length) return '';
    return `<div class="otd"><p class="eyebrow">${icon('sparkle')}Tal día como hoy</p>${hits.map((k) => {
      const ago = year - +k.slice(0, 4);
      return `<button class="otd-item" data-reveal="${k}"><span class="otd-year">${k.slice(0, 4)} · hace ${plural(ago, 'año', 'años')}</span><span class="otd-text">${plansHTML(data.days[k])}</span></button>`;
    }).join('')}</div>`;
  }

  function emptyHTML() {
    const first = !allKeys().length;
    return `<div class="empty">
      <div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2>${first ? 'Tu aventura empieza aquí' : `Aún no hay recuerdos en ${year}`}</h2>
      <p>${first ? 'Apunta los días que se salen de lo normal. Si ya los tienes en las notas del móvil o en un .docx, tráelos de golpe.' : 'Los días que hagas algo distinto aparecerán aquí.'}</p>
      <div class="empty-actions">
        ${first ? `<button class="btn btn-primary" data-action="import-docx">Importar mi .docx</button><button class="btn btn-ghost" data-action="import-paste">Pegar desde notas</button>` : ''}
        <button class="btn ${first ? 'btn-ghost' : 'btn-primary'}" data-add="${year === new Date().getFullYear() ? todayISO() : iso(year, 1, 1)}">Añadir recuerdo</button>
      </div>
    </div>`;
  }

  function renderSearch(root) {
    const q = norm(query.trim());
    const hits = allKeys().reverse().filter((k) => {
      const e = data.days[k];
      for (const f of filters) if (!hasFlag(e, f)) return false;
      return !q || norm(entryText(e)).includes(q) || (typeof e.trip === 'string' && norm(e.trip).includes(q));
    });
    if (!hits.length) {
      root.innerHTML = `<div class="empty small"><h2>Nada por aquí</h2><p>Prueba con otra palabra o quita algún filtro.</p></div>`;
      return;
    }
    let html = `<p class="result-count">${plural(hits.length, 'día encontrado', 'días encontrados')}</p>`;
    let group = '';
    for (const k of hits) {
      const g = k.slice(0, 7);
      if (g !== group) {
        if (group) html += '</section>';
        group = g;
        html += `<section class="month"><header class="month-head"><h2>${MONTHS[+g.slice(5) - 1]} <span class="mh-year">${g.slice(0, 4)}</span></h2></header>`;
      }
      html += dayHTML(k, data.days[k], { q, tripMark: true });
    }
    root.innerHTML = html + '</section>';
  }

  function renderMonths() {
    const nav = $('#months');
    const counts = new Array(13).fill(0);
    for (const k of yearKeys(year)) counts[+k.slice(5, 7)]++;
    nav.innerHTML = MONTHS_SHORT.map((m, i) => `<button class="mchip" data-jump="${i + 1}" ${counts[i + 1] ? '' : 'disabled'}>${m}</button>`).join('');
    spy();
  }

  function spy() {
    if (view !== 'diario' || query || filters.size) { $('#today-btn').hidden = true; return; }
    const head = $('.topbar').getBoundingClientRect().height;
    let current = null;
    for (const s of $$('#view-diario .month[data-month]')) {
      if (s.getBoundingClientRect().top - head <= 24) current = s.dataset.month;
    }
    if (!current) current = $('#view-diario .month[data-month]')?.dataset.month;
    for (const b of $$('#months .mchip')) {
      const on = b.dataset.jump === current;
      if (on && !b.classList.contains('active')) {
        b.classList.add('active');
        const nav = $('#months');
        // Sin animación: en Chrome un scroll suave aquí cancela el scroll suave de la página
        nav.scrollLeft = b.offsetLeft - nav.clientWidth / 2 + b.clientWidth / 2;
      } else if (!on) b.classList.remove('active');
    }
    const mark = $('#today-mark');
    let show = false;
    if (mark) {
      const r = mark.getBoundingClientRect();
      show = r.bottom < head || r.top > window.innerHeight;
    }
    $('#today-btn').hidden = !show;
  }

  /* ---------- Año ---------- */
  function yearGridHTML(y, compact) {
    const t = todayISO();
    let html = `<div class="ycal${compact ? ' compact' : ''}">`;
    for (let m = 1; m <= 12; m++) {
      const dim = daysInMonth(y, m);
      const offset = (weekday(iso(y, m, 1)) + 6) % 7;
      let count = 0;
      let cells = '<span></span>'.repeat(offset);
      for (let d = 1; d <= dim; d++) {
        const k = iso(y, m, d);
        const e = data.days[k];
        const cls = ['yg-c'];
        if (e) { cls.push('c-' + category(e)); if (k <= t) count++; }
        if (k === t) cls.push('today');
        if (k > t) cls.push('fut');
        if (k === peekDate && !compact) cls.push('sel');
        const tip = `${d} ${MONTHS_SHORT[m - 1]}${e ? ' · ' + entryText(e) : ''}`;
        cells += `<button class="${cls.join(' ')}" data-cell="${k}" title="${esc(tip)}" aria-label="${esc(tip)}">${compact ? '' : d}</button>`;
      }
      html += `<div class="mcal">
        <h4><span>${compact ? MONTHS_SHORT[m - 1] : MONTHS[m - 1]}</span>${count ? `<small>${count}</small>` : ''}</h4>
        ${compact ? '' : `<div class="mcal-wd">${[...'LMXJVSD'].map((c) => `<span>${c}</span>`).join('')}</div>`}
        <div class="mcal-grid">${cells}</div>
      </div>`;
    }
    return html + '</div>';
  }

  const legendHTML = () => `<div class="legend">
    <span><i class="lg c-has"></i>Algo especial</span>
    <span><i class="lg c-late"></i>Hasta tarde</span>
    <span><i class="lg c-star"></i>Destacado</span>
    <span><i class="lg c-trip"></i>Viaje</span>
    <span><i class="lg c-exam"></i>Examen</span>
  </div>`;

  function renderAnio() {
    const root = $('#view-anio');
    const keys = yearKeys(year);
    const t = todayISO();
    const cy = +t.slice(0, 4);
    const elapsed = year < cy ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365) : year === cy ? dayNum(t) - dayNum(iso(year, 1, 1)) + 1 : 0;
    const past = keys.filter((k) => k <= t).length;
    const upcoming = keys.length - past;
    root.innerHTML = `<div class="page-head">
        <h2 class="display">${year}</h2>
        <p>${elapsed ? `${plural(past, 'día', 'días')} con algo que contar de ${elapsed}${year === cy ? ' hasta hoy' : ''}` : 'Un año por estrenar'}${upcoming ? ` · ${plural(upcoming, 'plan', 'planes')} por venir` : ''}</p>
      </div>
      <div class="card yg-card">${yearGridHTML(year, false)}${legendHTML()}</div>
      <div id="peek" class="peek">${peekHTML()}</div>`;
  }

  function peekHTML() {
    if (!peekDate || !peekDate.startsWith(year + '-')) {
      return `<p class="peek-hint">Toca un día para verlo. Los huecos vacíos también: puedes añadir un recuerdo olvidado.</p>`;
    }
    const e = data.days[peekDate];
    return `<div class="card peek-card">
      <p class="eyebrow">${esc(fmtLong(peekDate))}</p>
      ${e ? `<div class="peek-plans">${e.trip ? `<span class="peek-trip">${icon('plane')}${esc(typeof e.trip === 'string' ? e.trip : 'Viaje')}</span>` : ''}${plansHTML(e)}</div>` : '<p class="muted">Nada apuntado este día.</p>'}
      <div class="peek-actions">
        ${e ? `<button class="btn btn-ghost" data-reveal="${peekDate}">Ver en el diario</button><button class="btn btn-primary" data-edit="${peekDate}">Editar</button>` : `<button class="btn btn-primary" data-add="${peekDate}">${icon('plus')}Añadir recuerdo</button>`}
      </div>
    </div>`;
  }

  /* ---------- Resumen ---------- */
  function graphemes(s) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);
    }
    return [...s];
  }

  function emojiCounts(keys) {
    const counts = new Map();
    for (const k of keys) {
      for (const p of data.days[k].plans) {
        for (const g of graphemes(p.t)) {
          if (!EMOJI_RE.test(g)) continue;
          const key = g.replace(/\ufe0f/g, '');
          const c = counts.get(key) || { e: g, n: 0 };
          c.n++;
          counts.set(key, c);
        }
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n);
  }

  function classics(keys) {
    const counts = new Map();
    for (const k of keys) {
      const seen = new Set();
      for (const p of data.days[k].plans) {
        if (p.exam) continue;
        let t = p.t.replace(/\([^)]*\)/g, ' ').replace(EMOJI_STRIP, ' ');
        t = t.split(/\s(?:w\/|c\/|a\/|con\s|at\s|en\s)|\sw\//i)[0];
        t = t.replace(/\s+\d+\s*$/, '').replace(/\s+/g, ' ').trim();
        if (t.length < 3) continue;
        const key = norm(t);
        if (seen.has(key)) continue;
        seen.add(key);
        const c = counts.get(key) || { t, n: 0 };
        c.n++;
        counts.set(key, c);
      }
    }
    return [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n);
  }

  function renderResumen() {
    const root = $('#view-resumen');
    const t = todayISO();
    const keys = yearKeys(year).filter((k) => k <= t);
    if (!keys.length) {
      root.innerHTML = `<div class="page-head"><h2 class="display">${year}</h2></div><div class="empty small"><h2>Sin datos todavía</h2><p>Cuando apuntes recuerdos de ${year} verás aquí su resumen.</p></div>`;
      return;
    }
    const cy = +t.slice(0, 4);
    const totalDays = year < cy ? dayNum(iso(year + 1, 1, 1)) - dayNum(iso(year, 1, 1)) : dayNum(t) - dayNum(iso(year, 1, 1)) + 1;
    const E = keys.map((k) => data.days[k]);
    const lateDays = E.filter(isLate).length;
    const exams = E.reduce((n, e) => n + e.plans.filter((p) => p.exam).length, 0);
    const stars = E.reduce((n, e) => n + e.plans.filter((p) => p.star).length, 0);
    const trips = tripInfo();
    const tripKeys = keys.filter((k) => data.days[k].trip);
    const tripRuns = [...new Set(tripKeys.map((k) => trips[k]))];

    // racha más larga
    let best = { len: 0 };
    let run = [keys[0]];
    for (let i = 1; i <= keys.length; i++) {
      if (i < keys.length && dayNum(keys[i]) - dayNum(keys[i - 1]) === 1) { run.push(keys[i]); continue; }
      if (run.length > best.len) best = { len: run.length, start: run[0], end: run[run.length - 1] };
      run = [keys[i]];
    }

    const months = Array.from({ length: 12 }, () => ({ d: 0, l: 0 }));
    const wds = new Array(7).fill(0);
    for (const k of keys) {
      const m = +k.slice(5, 7) - 1;
      months[m].d++;
      if (isLate(data.days[k])) months[m].l++;
      wds[(weekday(k) + 6) % 7]++;
    }
    const maxM = Math.max(...months.map((m) => m.d), 1);
    const maxW = Math.max(...wds, 1);
    const busiest = months.reduce((b, m, i) => (m.d > months[b].d ? i : b), 0);
    const emojis = emojiCounts(keys).slice(0, 24);
    const maxE = emojis[0]?.n || 1;
    const top = classics(keys).slice(0, 10);
    const lastMonth = year < cy ? 12 : +t.slice(5, 7);

    root.innerHTML = `
      <div class="page-head">
        <h2 class="display">${year}</h2>
        <p><strong>${plural(keys.length, 'día', 'días')}</strong> con algo que contar · ${Math.round((keys.length / totalDays) * 100)}% de los días${year === cy ? ' hasta hoy' : ''}</p>
      </div>
      <div class="stats">
        <div class="stat s-late">${icon('moon')}<b>${lateDays}</b><span>noches hasta tarde</span></div>
        <div class="stat s-star">${icon('star')}<b>${stars}</b><span>${stars === 1 ? 'plan destacado' : 'planes destacados'}</span></div>
        <div class="stat s-trip">${icon('plane')}<b>${tripRuns.length}</b><span>${tripRuns.length === 1 ? 'viaje' : 'viajes'} · ${plural(tripKeys.length, 'día', 'días')}</span></div>
        <div class="stat s-exam">${icon('cap')}<b>${exams}</b><span>exámenes</span></div>
      </div>
      <div class="grid2">
        <div class="card">
          <h3>Mes a mes</h3>
          <div class="bars">${months.map((m, i) => `<div class="bar ${i >= lastMonth ? 'dim' : ''}" title="${MONTHS[i]}: ${plural(m.d, 'día', 'días')}, ${m.l} hasta tarde">
              <span class="bar-v">${m.d || ''}</span>
              <div class="bar-track"><div class="bar-fill" style="height:${(m.d / maxM) * 100}%"><div class="bar-late" style="height:${m.d ? (m.l / m.d) * 100 : 0}%"></div></div></div>
              <span class="bar-l">${MONTHS_SHORT[i].slice(0, 1).toUpperCase()}</span></div>`).join('')}</div>
          <p class="foot"><i class="lg c-late"></i> parte hasta tarde · Mes más movido: <strong>${MONTHS[busiest]}</strong></p>
        </div>
        <div class="card">
          <h3>Por día de la semana</h3>
          <div class="hbars">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((n, i) => `<div class="hbar"><span>${n}</span><div class="hbar-track"><div style="width:${(wds[i] / maxW) * 100}%"></div></div><b>${wds[i]}</b></div>`).join('')}</div>
          ${best.len > 1 ? `<p class="foot">Racha más larga: <strong>${best.len} días seguidos</strong> (${fmtShort(best.start)} – ${fmtShort(best.end)})</p>` : ''}
        </div>
      </div>
      ${top.length ? `<div class="card">
        <h3>Los clásicos del año</h3>
        <ol class="classics">${top.map((c) => `<li><span>${esc(c.t)}</span><b>×${c.n}</b></li>`).join('')}</ol>
      </div>` : ''}
      ${emojis.length ? `<div class="card">
        <h3>Tus emojis</h3>
        <div class="emoji-cloud">${emojis.map((e) => `<span style="--s:${0.9 + (e.n / maxE) * 1.3}"><em>${e.e}</em><small>${e.n}</small></span>`).join('')}</div>
      </div>` : ''}
      ${tripRuns.length ? `<div class="card">
        <h3>Viajes</h3>
        <ul class="trip-list">${tripRuns.map((r) => `<li><button data-reveal="${r.start}">${icon('plane')}<strong>${esc(r.name || 'Viaje')}</strong><span>${fmtShort(r.start)}${r.len > 1 ? ' – ' + fmtShort(r.end) : ''} · ${plural(r.len, 'día', 'días')}</span></button></li>`).join('')}</ul>
      </div>` : ''}`;
  }

  /* ---------- panel lateral (escritorio) ---------- */
  function renderAside() {
    const aside = $('#aside');
    if (view !== 'diario') { aside.innerHTML = ''; return; }
    const keys = yearKeys(year).filter((k) => k <= todayISO());
    aside.innerHTML = `<div class="card">
      <p class="eyebrow">${year} de un vistazo</p>
      ${yearGridHTML(year, true)}
      ${legendHTML()}
      <p class="foot">${plural(keys.length, 'día', 'días')} · ${icon('moon', 'mh-ico')}${keys.filter((k) => isLate(data.days[k])).length} noches</p>
    </div>`;
  }

  /* ---------- render general ---------- */
  function render() {
    const [minY, maxY] = yearRange();
    year = Math.min(Math.max(year, minY), maxY);
    $('#year-label').textContent = year;
    $('#year-prev').disabled = year <= minY;
    $('#year-next').disabled = year >= maxY;
    for (const v of ['diario', 'anio', 'resumen']) $('#view-' + v).hidden = view !== v;
    for (const b of $$('.tab')) b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false');
    const searching = !!(query || filters.size);
    document.body.classList.toggle('searching', searching);
    $('#months').hidden = view !== 'diario' || searching;
    $('.year-switch').classList.toggle('muted-switch', view === 'diario' && searching);
    if (view === 'diario') { renderDiario(); renderMonths(); }
    if (view === 'anio') renderAnio();
    if (view === 'resumen') renderResumen();
    renderAside();
    updateBackupInfo();
    requestAnimationFrame(spy);
  }

  function setView(v) {
    view = v;
    render();
    window.scrollTo({ top: 0 });
    if (v === 'diario') scrollToToday(false);
  }

  function scrollToToday(smooth) {
    const mark = $('#today-mark');
    if (mark) mark.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    else if (year === new Date().getFullYear()) window.scrollTo({ top: document.body.scrollHeight });
  }

  function revealDay(k) {
    query = '';
    filters.clear();
    $('#search').value = '';
    $$('#filters .chip').forEach((c) => c.classList.remove('on'));
    year = +k.slice(0, 4);
    view = 'diario';
    render();
    const el = $(`#view-diario .day[data-date="${k}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  /* ---------- editor ---------- */
  const editor = $('#editor');
  const planList = $('#plan-list');
  const dateInput = $('#editor-date');
  const tripToggle = $('#trip-toggle');
  const tripName = $('#trip-name');
  let editing = null;
  let lastInput = null;

  function updateDateLabel() {
    const v = dateInput.value;
    $('#editor-date-label').textContent = v ? fmtLong(v) : 'Elige un día';
    $('#merge-note').hidden = !(v && data.days[v] && v !== editing?.orig);
  }

  function syncRow(row) {
    const input = $('.plan-input', row);
    for (const b of $$('.tg[data-flag]', row)) input.classList.toggle('f-' + b.dataset.flag, b.getAttribute('aria-pressed') === 'true');
  }

  function addPlanRow(p, after) {
    const row = document.createElement('div');
    row.className = 'plan-row';
    row.innerHTML = `<input class="plan-input" type="text" placeholder="¿Qué pasó? Separa planes con +" enterkeyhint="next" aria-label="Plan">
      <div class="plan-tools">
        <button type="button" class="tg tg-late" data-flag="late" aria-pressed="false" title="Acabó pasadas las 00:00">${icon('moon')}<span class="l-long">Hasta tarde</span><span class="l-short">Noche</span></button>
        <button type="button" class="tg tg-star" data-flag="star" aria-pressed="false" title="Plan esperado, relevante o con mucho impacto">${icon('star')}<span>Destacado</span></button>
        <button type="button" class="tg tg-exam" data-flag="exam" aria-pressed="false" title="Examen final o recuperación">${icon('cap')}<span>Examen</span></button>
        <button type="button" class="tg tg-del" aria-label="Quitar este plan">${icon('trash')}</button>
      </div>`;
    const input = $('.plan-input', row);
    input.value = p.t || '';
    for (const f of ['late', 'star', 'exam']) $(`.tg[data-flag="${f}"]`, row).setAttribute('aria-pressed', p[f] ? 'true' : 'false');
    syncRow(row);
    if (after) after.after(row); else planList.append(row);
    return input;
  }

  function collectPlans() {
    const plans = [];
    for (const row of $$('.plan-row', planList)) {
      const flags = {};
      for (const b of $$('.tg[data-flag]', row)) if (b.getAttribute('aria-pressed') === 'true') flags[b.dataset.flag] = true;
      for (const piece of $('.plan-input', row).value.split('+')) {
        const t = piece.replace(/\s+/g, ' ').trim();
        if (t) plans.push({ t, ...flags });
      }
    }
    return plans;
  }

  function renderEmojiBar() {
    const used = emojiCounts(allKeys()).slice(0, 28).map((e) => e.e);
    const list = used.length >= 8 ? used : [...new Set([...used, ...DEFAULT_EMOJIS])].slice(0, 24);
    $('#emoji-bar').innerHTML = list.map((e) => `<button type="button" class="emo" data-emoji="${esc(e)}">${e}</button>`).join('');
  }

  function openEditor(k, opts = {}) {
    const e = data.days[k];
    editing = { orig: e ? k : null };
    $('#editor-kind').textContent = e ? 'Editar recuerdo' : 'Nuevo recuerdo';
    dateInput.value = k;
    planList.innerHTML = '';
    (e ? e.plans : []).forEach((p) => addPlanRow(p));
    let focus = null;
    if (!e || opts.newPlan) focus = addPlanRow({ t: '' });
    tripToggle.checked = !!e?.trip;
    tripName.value = typeof e?.trip === 'string' ? e.trip : '';
    tripName.hidden = !tripToggle.checked;
    $('#editor-delete').hidden = !e;
    updateDateLabel();
    renderEmojiBar();
    editor.showModal();
    lastInput = focus || $$('.plan-input', planList).pop();
    if (focus && !matchMedia('(pointer: coarse)').matches) focus.focus();
  }

  function propagateTripName(k, name) {
    for (const dir of [-1, 1]) {
      let c = addDays(k, dir);
      while (data.days[c]?.trip) { data.days[c].trip = name; c = addDays(c, dir); }
    }
  }

  function saveEditor() {
    const k = dateInput.value;
    if (!k) { dateInput.focus(); return; }
    const plans = collectPlans();
    const trip = tripToggle.checked ? (tripName.value.trim() || true) : null;
    const orig = editing.orig;
    if (!plans.length) {
      editor.close();
      if (orig) deleteDay(orig);
      return;
    }
    let entry = { plans };
    if (trip) entry.trip = trip;
    if (orig && orig !== k) delete data.days[orig];
    if (data.days[k] && orig !== k) {
      const ex = data.days[k];
      entry = { plans: [...ex.plans, ...plans] };
      if (trip || ex.trip) entry.trip = trip || ex.trip;
    }
    data.days[k] = entry;
    if (typeof trip === 'string') propagateTripName(k, trip);
    save();
    touchActivity();
    editor.close();
    revealDay(k);
    toast(orig ? 'Cambios guardados' : 'Recuerdo guardado');
  }

  function deleteDay(k) {
    const prev = data.days[k];
    if (!prev) return;
    delete data.days[k];
    save();
    render();
    toast(`Eliminado el ${fmtShort(k)}`, 'Deshacer', () => { data.days[k] = prev; save(); revealDay(k); });
  }

  planList.addEventListener('click', (ev) => {
    const tg = ev.target.closest('.tg');
    if (!tg) return;
    const row = tg.closest('.plan-row');
    if (tg.classList.contains('tg-del')) {
      const prev = row.previousElementSibling || row.nextElementSibling;
      row.remove();
      if (!$('.plan-row', planList)) addPlanRow({ t: '' }).focus();
      else if (prev) lastInput = $('.plan-input', prev);
      return;
    }
    tg.setAttribute('aria-pressed', tg.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    syncRow(row);
  });
  planList.addEventListener('focusin', (ev) => { if (ev.target.classList.contains('plan-input')) lastInput = ev.target; });
  planList.addEventListener('keydown', (ev) => {
    const input = ev.target;
    if (!input.classList.contains('plan-input')) return;
    if (ev.key === 'Enter' && !ev.isComposing) {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) { saveEditor(); return; }
      addPlanRow({ t: '' }, input.closest('.plan-row')).focus();
    } else if (ev.key === 'Backspace' && !input.value && $$('.plan-row', planList).length > 1) {
      ev.preventDefault();
      const row = input.closest('.plan-row');
      const prev = row.previousElementSibling || row.nextElementSibling;
      row.remove();
      const pi = $('.plan-input', prev);
      pi.focus();
      pi.setSelectionRange(pi.value.length, pi.value.length);
    }
  });
  $('#add-plan').addEventListener('click', () => {
    addPlanRow({ t: '' }).focus();
  });
  $('#emoji-bar').addEventListener('pointerdown', (ev) => { if (ev.target.closest('.emo')) ev.preventDefault(); });
  $('#emoji-bar').addEventListener('click', (ev) => {
    const b = ev.target.closest('.emo');
    if (!b) return;
    const input = lastInput && lastInput.isConnected ? lastInput : $$('.plan-input', planList).pop() || addPlanRow({ t: '' });
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, s) + b.dataset.emoji + input.value.slice(e);
    const pos = s + b.dataset.emoji.length;
    input.focus();
    input.setSelectionRange(pos, pos);
  });
  dateInput.addEventListener('change', updateDateLabel);
  tripToggle.addEventListener('change', () => {
    tripName.hidden = !tripToggle.checked;
    if (tripToggle.checked && !tripName.value) {
      const prev = data.days[addDays(dateInput.value, -1)];
      if (typeof prev?.trip === 'string') tripName.value = prev.trip;
    }
  });
  $('#editor-form').addEventListener('submit', (ev) => { ev.preventDefault(); saveEditor(); });
  $('#editor-delete').addEventListener('click', () => {
    const k = editing.orig;
    editor.close();
    if (k) deleteDay(k);
  });

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (actionLabel) $('button', el).onclick = () => { el.hidden = true; action(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, actionLabel ? 6000 : 2600);
  }

  /* ---------- importar ---------- */
  const importer = $('#importer');
  let pending = null;
  let pasted = null;

  function openImport(kind) {
    $('#menu').close();
    pending = null;
    pasted = null;
    $('#import-docx-box').hidden = kind !== 'docx';
    $('#import-paste-box').hidden = kind !== 'paste';
    $('#import-json-box').hidden = kind !== 'json';
    $('#import-year').closest('label').hidden = kind === 'json';
    $('#import-step-source').hidden = false;
    $('#import-step-preview').hidden = true;
    $('#import-title').textContent = { docx: 'Desde un .docx', paste: 'Pegar desde notas', json: 'Restaurar copia' }[kind];
    $('#import-year').value = new Date().getFullYear();
    importError('');
    $('#paste-area').textContent = '';
    $('#docx-input').value = '';
    $('#json-input').value = '';
    importer.showModal();
  }

  function showPreview(result) {
    pending = result;
    const keys = Object.keys(result.days).sort();
    const vals = keys.map((k) => result.days[k]);
    const years = [...new Set(keys.map((k) => k.slice(0, 4)))];
    const conflicts = keys.filter((k) => data.days[k]).length;
    const late = vals.filter(isLate).length;
    const exams = vals.reduce((n, e) => n + e.plans.filter((p) => p.exam).length, 0);
    const stars = vals.reduce((n, e) => n + e.plans.filter((p) => p.star).length, 0);
    const trips = vals.filter((e) => e.trip).length;
    $('#import-summary').innerHTML = keys.length
      ? `<p class="big">${plural(keys.length, 'día', 'días')} <span>de ${years.join(', ')}</span></p>
         <ul class="pills">
           <li>${icon('moon')}${late} hasta tarde</li>
           <li>${icon('cap')}${exams} exámenes</li>
           <li>${icon('plane')}${trips} días de viaje</li>
           ${stars ? `<li>${icon('star')}${stars} destacados</li>` : ''}
         </ul>
         ${result.skipped?.length ? `<details class="skipped"><summary>${plural(result.skipped.length, 'línea no reconocida', 'líneas no reconocidas')} (se ignoran)</summary><ul>${result.skipped.slice(0, 30).map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}`
      : `<p class="big">No he encontrado días</p><p class="hint">Cada línea debe empezar con la fecha, por ejemplo «7 Febrero - Coso Blanco🎉». Si falta el año, ponlo en una línea sola (p. ej. «2025») o indícalo abajo.</p>`;
    $('#import-sample').innerHTML = keys.map((k) => `<div class="sample-row"><span class="sample-date">${fmtShort(k)} ${k.slice(0, 4)}</span>${dayHTML(k, result.days[k], { tripMark: true })}</div>`).join('');
    $('#import-conflict').hidden = !conflicts;
    if (conflicts) $('#import-conflict legend').textContent = `${plural(conflicts, 'día ya existe', 'días ya existen')} en la app`;
    $('#import-go').disabled = !keys.length;
    $('#import-step-source').hidden = true;
    $('#import-step-preview').hidden = false;
  }

  function importError(msg) {
    const el = $('#import-error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  function importYear() {
    const y = +$('#import-year').value;
    return y >= 1900 && y <= 2200 ? y : new Date().getFullYear();
  }

  $('#docx-input').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const paras = await Importer.docxToParagraphs(await f.arrayBuffer());
      showPreview(Importer.analyse(paras, importYear()));
    } catch (err) {
      importError(err.message || 'No se ha podido leer el archivo.');
    }
  });
  $('#paste-area').addEventListener('paste', (ev) => {
    const html = ev.clipboardData.getData('text/html');
    const text = ev.clipboardData.getData('text/plain');
    if (!html && !text) return;
    ev.preventDefault();
    pasted = { html, text };
    ev.currentTarget.textContent = text || ev.currentTarget.textContent;
  });
  $('#paste-area').addEventListener('input', () => { pasted = null; });
  $('#paste-go').addEventListener('click', () => {
    const paras = pasted?.html
      ? Importer.htmlToParagraphs(pasted.html)
      : Importer.textToParagraphs(pasted?.text || $('#paste-area').innerText);
    showPreview(Importer.analyse(paras, importYear()));
  });
  $('#json-input').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!obj || typeof obj.days !== 'object') throw new Error();
      const days = {};
      for (const [k, e] of Object.entries(obj.days)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(e?.plans)) days[k] = e;
      }
      showPreview({ days, skipped: [] });
    } catch (err) {
      importError('Ese archivo no es una copia de Mi aventura.');
    }
  });
  $('#import-back').addEventListener('click', () => {
    $('#import-step-source').hidden = false;
    $('#import-step-preview').hidden = true;
  });
  $('#import-go').addEventListener('click', () => {
    if (!pending) return;
    const keep = $('input[name="conflict"]:checked').value === 'keep';
    let n = 0;
    for (const [k, e] of Object.entries(pending.days)) {
      if (keep && data.days[k]) continue;
      data.days[k] = e;
      n++;
    }
    save();
    if (n) touchActivity();
    importer.close();
    const ys = Object.keys(pending.days).map((k) => +k.slice(0, 4));
    const cy = new Date().getFullYear();
    year = ys.includes(cy) ? cy : Math.max(...ys);
    view = 'diario';
    render();
    scrollToToday(false);
    toast(`${plural(n, 'día importado', 'días importados')}`);
  });

  /* ---------- exportar ---------- */
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function exportJSON() {
    const body = JSON.stringify({ app: 'mi-aventura', version: 1, exported: new Date().toISOString(), days: data.days }, null, 1);
    const name = `mi-aventura-${todayISO()}.json`;
    const file = new File([body], name, { type: 'application/json' });
    try {
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Copia de Mi aventura' });
      } else download(file, name);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      download(file, name);
    }
    prefs.lastBackup = Date.now();
    savePrefs();
    updateBackupInfo();
    toast('Copia descargada');
  }

  function toText() {
    const out = [];
    let y = null;
    for (const k of allKeys()) {
      const [ky, m, d] = parts(k);
      if (ky !== y) { if (y) out.push(''); out.push(String(ky)); y = ky; }
      const e = data.days[k];
      const plans = e.plans.map((p) => {
        let t = p.t;
        if (p.exam) t = `_${t}_`;
        if (p.late) t = `*${t}*`;
        if (p.star) t = `==${t}==`;
        return t;
      }).join(' + ');
      const trip = e.trip ? ` [viaje${typeof e.trip === 'string' ? ': ' + e.trip : ''}]` : '';
      out.push(`${d} ${MONTHS[m - 1]} - ${plans}${trip}`);
    }
    return out.join('\n');
  }

  function updateBackupInfo() {
    const n = allKeys().length;
    const last = prefs.lastBackup;
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    $('#backup-dot').hidden = !(n >= 5 && (days === null || days > 30));
    $('#backup-info').textContent = last
      ? `Última copia: ${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}.`
      : 'Tus recuerdos se guardan solo en este dispositivo. Haz copias de vez en cuando.';
  }

  /* ---------- recordatorio ---------- */
  const R = window.MiAventuraRecordatorio;
  const REMINDER_MSG = {
    off: `Te llegará una notificación si pasan ${R.DAYS} días sin que apuntes nada.`,
    ok: 'Activado. Android lo comprueba en segundo plano un par de veces al día y solo avisa entre las 9:00 y las 22:00.',
    install: 'Casi listo: para que avise con la app cerrada, instálala desde Chrome (menú ⋮ → «Instalar aplicación») y ábrela desde su icono.',
    unsupported: 'Este navegador no puede avisar con la app cerrada. Funciona en Chrome para Android con la app instalada.',
    blocked: 'Las notificaciones están bloqueadas para este sitio. Permítelas en los ajustes de Chrome (el permiso es común a tus apps de github.io).',
  };

  function getReg() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return Promise.resolve(null);
    return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))]);
  }

  async function registerPeriodic(reg) {
    if (!reg || !('periodicSync' in reg)) return 'unsupported';
    try {
      const p = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (p.state !== 'granted') return 'install';
    } catch (e) { /* sin API de permisos: se intenta igualmente */ }
    try {
      await reg.periodicSync.register(R.TAG, { minInterval: 12 * 3600e3 });
      return 'ok';
    } catch (e) {
      return 'install';
    }
  }

  // Cada vez que apuntas algo: reinicia la cuenta y quita el aviso si estaba en pantalla
  async function touchActivity() {
    try {
      await R.update({ lastActivity: Date.now() });
      const reg = await getReg();
      (await reg?.getNotifications({ tag: R.TAG }))?.forEach((n) => n.close());
    } catch (e) { /* sin IndexedDB no hay recordatorio */ }
  }

  async function renderReminder(override) {
    const s = await R.load();
    $('#reminder-toggle').checked = !!s.enabled;
    $('#reminder-test').hidden = !s.enabled;
    let state = override || 'off';
    if (!override && s.enabled) {
      state = !('Notification' in window) ? 'unsupported'
        : Notification.permission !== 'granted' ? 'blocked'
        : await registerPeriodic(await getReg());
    }
    $('#reminder-status').textContent = REMINDER_MSG[state];
  }

  $('#reminder-toggle').addEventListener('change', async (ev) => {
    if (!ev.target.checked) {
      await R.update({ enabled: false });
      try { await (await getReg())?.periodicSync?.unregister(R.TAG); } catch (e) { /* nada que quitar */ }
      renderReminder();
      return;
    }
    if (!('Notification' in window) || !(await getReg())) {
      ev.target.checked = false;
      renderReminder('unsupported');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      await R.update({ enabled: false });
      renderReminder('blocked');
      return;
    }
    const s = await R.load();
    await R.update({ enabled: true, lastActivity: s.lastActivity || Date.now(), lastNotified: 0 });
    renderReminder();
  });

  $('#reminder-test').addEventListener('click', async () => {
    const reg = await getReg();
    if (!reg?.active || Notification.permission !== 'granted') { renderReminder(); return; }
    reg.active.postMessage({ type: 'mi-aventura:probar' });
  });

  /* ---------- tema ---------- */
  function applyTheme() {
    const t = prefs.theme || 'auto';
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    for (const b of $$('#theme-seg button')) b.classList.toggle('on', b.dataset.themeOpt === t);
  }

  /* ---------- eventos globales ---------- */
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    const close = t.closest('[data-close]');
    if (close) { close.closest('dialog').close(); return; }
    const tab = t.closest('.tab');
    if (tab) { setView(tab.dataset.view); return; }
    const act = t.closest('[data-action]');
    if (act) { runAction(act.dataset.action); return; }
    const add = t.closest('[data-add]');
    if (add) { openEditor(add.dataset.add); return; }
    const edit = t.closest('[data-edit]');
    if (edit) { openEditor(edit.dataset.edit); return; }
    const rev = t.closest('[data-reveal]');
    if (rev) { revealDay(rev.dataset.reveal); return; }
    const cell = t.closest('[data-cell]');
    if (cell) {
      const k = cell.dataset.cell;
      if (cell.closest('#aside')) { data.days[k] ? revealDay(k) : openEditor(k); return; }
      peekDate = k;
      $$('#view-anio .yg-c.sel').forEach((c) => c.classList.remove('sel'));
      cell.classList.add('sel');
      $('#peek').innerHTML = peekHTML();
      if (matchMedia('(max-width: 720px)').matches) $('#peek').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const jump = t.closest('[data-jump]');
    if (jump) {
      const sec = $(`#m-${year}-${pad(jump.dataset.jump)}`);
      if (sec) {
        const head = $('.topbar').getBoundingClientRect().height;
        window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - head + 1, behavior: 'smooth' });
      }
      return;
    }
    const day = t.closest('.day[data-date]');
    if (day && day.closest('main')) { openEditor(day.dataset.date); return; }
    const opt = t.closest('[data-theme-opt]');
    if (opt) { prefs.theme = opt.dataset.themeOpt; savePrefs(); applyTheme(); }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches?.('.day[data-date]')) openEditor(ev.target.dataset.date);
    if (document.querySelector('dialog[open]') || ev.target.matches?.('input, textarea, [contenteditable]')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); openToday(); }
    if (ev.key === '/') { ev.preventDefault(); toggleSearch(true); }
  });

  // Cerrar diálogos al pulsar fuera
  for (const d of $$('dialog')) {
    d.addEventListener('click', (ev) => {
      if (ev.target !== d) return;
      const r = d.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) d.close();
    });
  }

  function runAction(a) {
    if (a === 'import-docx') openImport('docx');
    else if (a === 'import-paste') openImport('paste');
    else if (a === 'import-json') openImport('json');
    else if (a === 'export-json') exportJSON();
    else if (a === 'export-text') {
      $('#menu').close();
      $('#text-out').value = toText();
      $('#textview').showModal();
    }
  }

  function openToday() {
    const t = todayISO();
    openEditor(t, { newPlan: !!data.days[t] });
  }

  function toggleSearch(force) {
    const bar = $('#searchbar');
    const open = force ?? bar.hidden;
    bar.hidden = !open;
    $('#search-toggle').setAttribute('aria-expanded', String(open));
    if (open) {
      if (view !== 'diario') { view = 'diario'; }
      $('#search').focus();
    } else {
      query = '';
      filters.clear();
      $('#search').value = '';
      $$('#filters .chip').forEach((c) => c.classList.remove('on'));
    }
    render();
    if (!open) scrollToToday(false);
  }

  $('#fab').addEventListener('click', openToday);
  $('#today-btn').addEventListener('click', () => scrollToToday(true));
  $('#menu-btn').addEventListener('click', () => { updateBackupInfo(); renderReminder(); $('#menu').showModal(); });
  $('#search-toggle').addEventListener('click', () => toggleSearch());
  $('#search').addEventListener('input', (ev) => {
    query = ev.target.value;
    render();
    window.scrollTo({ top: 0 });
  });
  $('#search').addEventListener('keydown', (ev) => { if (ev.key === 'Escape') toggleSearch(false); });
  $('#filters').addEventListener('click', (ev) => {
    const c = ev.target.closest('.chip');
    if (!c) return;
    const f = c.dataset.filter;
    if (filters.has(f)) filters.delete(f); else filters.add(f);
    c.classList.toggle('on', filters.has(f));
    render();
    window.scrollTo({ top: 0 });
  });
  $('#year-prev').addEventListener('click', () => { year--; peekDate = null; render(); window.scrollTo({ top: 0 }); });
  $('#year-next').addEventListener('click', () => {
    year++;
    peekDate = null;
    render();
    window.scrollTo({ top: 0 });
    if (view === 'diario') scrollToToday(false);
  });
  $('#text-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#text-out').value); toast('Copiado'); }
    catch (e) { $('#text-out').select(); document.execCommand('copy'); toast('Copiado'); }
  });
  $('#text-download').addEventListener('click', () => {
    download(new Blob([$('#text-out').value], { type: 'text/plain;charset=utf-8' }), `mi-aventura-${todayISO()}.txt`);
  });

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; spy(); });
  }, { passive: true });

  // Altura de la cabecera para las cabeceras de mes pegajosas
  const setHead = () => document.documentElement.style.setProperty('--head-h', $('.topbar').getBoundingClientRect().height + 'px');
  if (window.ResizeObserver) new ResizeObserver(setHead).observe($('.topbar'));
  setHead();

  // Si la app queda abierta y cambia el día
  let lastToday = todayISO();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && todayISO() !== lastToday) { lastToday = todayISO(); render(); }
  });

  /* ---------- arranque ---------- */
  applyTheme();
  render();
  scrollToToday(false);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Mensajes de nuestro service worker; los de otras apps del dominio se ignoran
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data?.type === 'mi-aventura:nuevo' && !editor.open) openToday();
    });
    // Mantener vivo el chequeo en segundo plano (p. ej. tras instalar la app)
    R.load().then(async (s) => { if (s.enabled) registerPeriodic(await getReg()); });
  }
  // Abierta desde el aviso: directamente al editor de hoy
  if (location.hash === '#nuevo') {
    history.replaceState(null, '', location.pathname + location.search);
    openToday();
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
