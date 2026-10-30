/* Mi aventura · sincronización cifrada entre dispositivos
 *
 * Usa el mismo servidor que el Calendario (Cloudflare Worker, rutas /sync/get y /sync/put):
 * el servidor solo guarda una «caja» de texto CIFRADO y no puede leer nada.
 *
 * · Una contraseña de sincronización, la misma en todos tus dispositivos. De ella se derivan
 *   (PBKDF2-SHA256, 600 000 iteraciones):
 *     - el identificador y el código de acceso de la caja (con una sal propia de Mi aventura,
 *       así que aunque uses la misma contraseña que en el Calendario son cajas distintas), y
 *     - la clave AES-GCM 256 con la que se cifran tus recuerdos EN el dispositivo.
 * · La clave se guarda en IndexedDB como no exportable; la contraseña no se guarda.
 * · Fusión por días: gana la versión más reciente de cada día (campo `u`); los días borrados
 *   también se borran en los demás dispositivos (`deleted`).
 */
self.MiAventuraSync = (() => {
  'use strict';

  const DEFAULT_SERVER = 'https://calendario-avisos.ulisesfna2.workers.dev';
  const ITERATIONS = 600000;
  const ACCOUNT_SALT = 'mi-aventura/cuenta/v1';
  const CFG_KEY = 'mi-aventura:sync';
  const TOMBSTONE_DAYS = 120;

  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { /* sin configuración */ }
  let status = { state: cfg.enabled ? 'idle' : 'off', error: null };
  let hooks = null;
  let busy = false;
  let again = false;
  let pushTimer = null;
  let changeSeq = 0;
  const listeners = new Set();

  function writeCfg(patch) {
    cfg = { ...cfg, ...patch };
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* sin guardar */ }
  }
  function setStatus(state, error = null) {
    status = { state, error };
    listeners.forEach((f) => f(getStatus()));
  }
  const serverUrl = () => (cfg.server || DEFAULT_SERVER).replace(/\/+$/, '');
  const getStatus = () => ({ ...status, enabled: !!cfg.enabled, lastSync: cfg.lastSync || null, pending: !!cfg.dirty, server: serverUrl() });

  /* ---------- servidor ---------- */
  async function api(path, body, allow = []) {
    const base = serverUrl();
    let r;
    try {
      r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error('No se puede conectar con el servidor. Revisa la conexión a internet.');
    }
    let j = null;
    try { j = JSON.parse(await r.text()); } catch (e) { /* no es JSON */ }
    if (!j) throw new Error('El servidor no responde como debería. Revisa su dirección en «Servidor».');
    if (allow.includes(r.status)) return { ...j, status: r.status };
    if (r.status === 403) throw new Error('El servidor ha rechazado el código de acceso.');
    if (!r.ok || j.error) throw new Error(j.error || `El servidor respondió ${r.status}`);
    return j;
  }

  /* ---------- cifrado ---------- */
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const b64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // Identificador y código de acceso de la caja (independientes de la clave de cifrado)
  async function deriveAccount(pass) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(ACCOUNT_SALT), iterations: ITERATIONS, hash: 'SHA-256' }, base, 256));
    const tagged = async (tag) => hex(await crypto.subtle.digest('SHA-256', new Uint8Array([...enc.encode(tag), ...bits])));
    return { id: (await tagged('id')).slice(0, 32), tok: await tagged('tok') };
  }

  async function encryptPayload(obj, key, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return JSON.stringify({ app: 'mi-aventura', v: 1, kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct) });
  }

  class WrongPass extends Error {}
  async function decryptPayload(text, key) {
    const f = JSON.parse(text);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, unb64(f.data));
      return JSON.parse(dec.decode(pt));
    } catch (e) {
      throw new WrongPass('La contraseña de sincronización no coincide');
    }
  }

  /* ---------- secretos en IndexedDB (misma base que el recordatorio) ---------- */
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('mi-aventura', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  const loadSecrets = async () => ({
    main: await idb('readonly', (s) => s.get('sync-main')).catch(() => null),
    auth: await idb('readonly', (s) => s.get('sync-auth')).catch(() => null),
  });
  const saveSecrets = (main, auth) => idb('readwrite', (s) => { s.put(main, 'sync-main'); return s.put(auth, 'sync-auth'); });
  const clearSecrets = () => idb('readwrite', (s) => { s.delete('sync-main'); return s.delete('sync-auth'); }).catch(() => {});

  /* ---------- fusión ---------- */
  function merge(local, remote) {
    const deleted = { ...(remote.deleted || {}) };
    for (const [k, t] of Object.entries(local.deleted || {})) deleted[k] = Math.max(t, deleted[k] || 0);
    const limit = Date.now() - TOMBSTONE_DAYS * 864e5;
    for (const [k, t] of Object.entries(deleted)) if (t < limit) delete deleted[k];
    const days = {};
    const keys = new Set([...Object.keys(local.days || {}), ...Object.keys(remote.days || {})]);
    for (const k of keys) {
      const a = local.days?.[k];
      const b = remote.days?.[k];
      // Gana el más reciente; con empate se queda el de este dispositivo
      const win = !b ? a : !a ? b : (b.u || 0) > (a.u || 0) ? b : a;
      if (deleted[k] && deleted[k] >= (win.u || 0)) continue;
      days[k] = win;
    }
    return { days, deleted };
  }

  // Comparación independiente del orden de las claves
  function stable(v) {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
    return v;
  }
  const same = (a, b) => JSON.stringify(stable({ d: a.days, x: a.deleted || {} })) === JSON.stringify(stable({ d: b.days, x: b.deleted || {} }));

  /* ---------- flujo ---------- */

  // Conecta este dispositivo. askPass({ mode: 'enter' | 'confirm-new', error }) devuelve la contraseña o null.
  async function connect(askPass) {
    let adopt = false;
    try {
      let error = null;
      for (;;) {
        const pass = await askPass({ mode: 'enter', error });
        if (!pass) throw new Error('Conexión cancelada');
        setStatus('syncing');
        const auth = await deriveAccount(pass);
        const r = await api('/sync/get', { ...auth, since: 0 });
        let main;
        if (r.exists) {
          // Ya hay una caja con esta contraseña: comprobar que se puede abrir
          const salt = unb64(JSON.parse(r.data).salt);
          const key = await deriveKey(pass, salt);
          await decryptPayload(r.data, key);
          main = { key, salt };
          adopt = !Object.keys(hooks.getLocal().days).length;
        } else {
          // No hay nada con esta contraseña: primera vez… o una errata
          setStatus(cfg.enabled ? 'idle' : 'off');
          const repeat = await askPass({ mode: 'confirm-new' });
          if (repeat == null) throw new Error('Conexión cancelada');
          if (repeat !== pass) { error = 'Las dos contraseñas no coinciden. Vuelve a escribirla.'; continue; }
          setStatus('syncing');
          const salt = crypto.getRandomValues(new Uint8Array(16));
          main = { key: await deriveKey(pass, salt), salt };
        }
        await saveSecrets(main, auth);
        break;
      }
      writeCfg({ enabled: true, rev: 0, dirty: true });
      setStatus('idle');
      await syncNow({ adopt });
      if (status.state === 'error') throw new Error(status.error);
    } catch (e) {
      setStatus(cfg.enabled ? 'error' : 'off', e.message);
      throw e;
    }
  }

  // Olvida la contraseña en este dispositivo (los recuerdos se quedan aquí y en el servidor)
  async function disconnect() {
    await clearSecrets();
    writeCfg({ enabled: false, lastSync: null, rev: 0, dirty: false });
    setStatus('off');
  }

  async function syncNow({ adopt = false } = {}) {
    if (!cfg.enabled || !hooks) return;
    if (busy) { again = true; return; }
    busy = true;
    again = false;
    setStatus('syncing');
    try {
      const { main, auth } = await loadSecrets();
      if (!main?.key || !auth?.id) throw Object.assign(new Error('Falta la contraseña de sincronización en este dispositivo'), { needsPass: true });
      for (let attempt = 0; ; attempt++) {
        const seq = changeSeq;
        const r = await api('/sync/get', { ...auth, since: adopt ? 0 : cfg.rev || 0 });
        let merged = hooks.getLocal();
        let upload = !r.exists || !!cfg.dirty;
        if (r.exists && !r.same) {
          if (JSON.parse(r.data).salt !== b64(main.salt)) throw new WrongPass('La contraseña de sincronización se cambió en otro dispositivo');
          const remote = await decryptPayload(r.data, main.key);
          merged = merge(adopt ? { days: {}, deleted: {} } : merged, remote);
          if (!same(merged, hooks.getLocal())) hooks.applyRemote(merged);
          upload = !same(merged, remote);
        }
        if (!upload) {
          writeCfg({ rev: r.rev, lastSync: Date.now(), ...(seq === changeSeq ? { dirty: false } : {}) });
          break;
        }
        const content = await encryptPayload({ v: 1, savedAt: Date.now(), ...merged }, main.key, main.salt);
        const w = await api('/sync/put', { ...auth, rev: r.exists ? r.rev : 0, data: content }, [409]);
        if (w.conflict) {
          // Otro dispositivo ha subido algo justo ahora: volver a traerlo y fusionar
          if (attempt >= 3) throw new Error('Otro dispositivo está sincronizando a la vez; se reintentará en unos minutos');
          adopt = false;
          continue;
        }
        writeCfg({ rev: w.rev, lastSync: Date.now(), ...(seq === changeSeq ? { dirty: false } : {}) });
        break;
      }
      setStatus('idle');
    } catch (e) {
      if (e.needsPass || e instanceof WrongPass) setStatus('needs-pass', e.message);
      else setStatus('error', e.message);
    } finally {
      busy = false;
      if (again) setTimeout(() => syncNow(), 500);
    }
  }

  // La app avisa de cada cambio local: se sube a los pocos segundos
  function changed() {
    changeSeq++;
    if (!cfg.enabled) return;
    if (!cfg.dirty) writeCfg({ dirty: true });
    listeners.forEach((f) => f(getStatus()));
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(), 4000);
  }

  function setServer(url) {
    let u = (url || '').trim();
    try { u = u ? new URL(u).origin : ''; } catch (e) { /* se valida al usarla */ }
    writeCfg({ server: u && u !== DEFAULT_SERVER ? u : undefined });
  }

  // hooks: { getLocal: () => ({days, deleted}), applyRemote: (merged) => void }
  function init(h) {
    hooks = h;
    // Traer cambios al abrir, al volver a la app y cada 3 minutos; subir lo pendiente al salir
    const pull = () => cfg.enabled && document.visibilityState === 'visible' && syncNow();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && cfg.enabled && cfg.dirty) syncNow();
      else pull();
    });
    setInterval(pull, 3 * 60000);
    setTimeout(pull, 1500);
  }

  return { init, connect, disconnect, syncNow, changed, getStatus, onStatus: (f) => listeners.add(f), setServer, merge, DEFAULT_SERVER };
})();
