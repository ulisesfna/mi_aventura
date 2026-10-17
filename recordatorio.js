/* Mi aventura · recordatorio
 * Compartido entre la página y el service worker (que no puede leer localStorage):
 * guarda en IndexedDB cuándo apuntaste algo por última vez y decide si toca avisar.
 */
self.MiAventuraRecordatorio = (() => {
  'use strict';

  const TAG = 'mi-aventura-recordatorio';
  const DB = 'mi-aventura';
  const STORE = 'kv';
  const KEY = 'recordatorio';
  const DAYS = 3;
  const DAY = 864e5;
  const QUIET = [9, 22]; // solo avisa entre las 9:00 y las 22:00

  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  };

  async function load() {
    try { return (await run('readonly', (s) => s.get(KEY))) || {}; } catch (e) { return {}; }
  }
  async function update(patch) {
    const next = { ...(await load()), ...patch };
    await run('readwrite', (s) => s.put(next, KEY));
    return next;
  }

  // Días de calendario entre dos instantes (lunes → jueves = 3)
  const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / DAY);

  // Devuelve los días sin apuntar nada si toca avisar ahora; 0 si no.
  function due(s, now = Date.now()) {
    if (!s.enabled || !s.lastActivity) return 0;
    const idle = daysBetween(s.lastActivity, now);
    if (idle < DAYS) return 0;
    // Si ya avisamos después de tu última entrada, se repite cada DAYS días
    if (s.lastNotified > s.lastActivity && daysBetween(s.lastNotified, now) < DAYS) return 0;
    const h = new Date(now).getHours();
    if (h < QUIET[0] || h >= QUIET[1]) return 0;
    return idle;
  }

  const text = (idle) => `Llevas ${idle} días sin apuntar nada. ¿Ha pasado algo que merezca quedarse?`;

  return { TAG, DAYS, load, update, due, text };
})();
