// Santos Tides on the Galaxy Watch (Tizen). Screens, bezel control, catch log, link to the phone app, notifications.
// The maths and data come from shared.js (copied from the phone app). This file never talks to the phone app's
// storage: the two are linked only through the Cloudflare Worker (same live data, same backup code).
(function () {
  'use strict';
  const BASE = 'https://santos-hooked-tides.ronnieandrodrigues.workers.dev';
  const ALERT_OP = 'http://santoshooked.uk/appcontrol/operation/alert';
  const VERSION = '1.0.0';
  const TZ = typeof tizen !== 'undefined' ? tizen : null;

  // ---------- small helpers ----------
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (err) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (err) {} };
  const lsJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (err) { return d; } };
  if (ls('sh-lang', '') === '') LANG = 'pt'; // the watch starts in Portuguese
  const L = (pt, en) => LANG === 'pt' ? pt : en;
  const T = s => tr(s);
  const springL = f => f > 0.66 ? L('Marés vivas', 'Spring tides') : f < 0.33 ? L('Marés mortas', 'Neap tides') : L('Entre vivas e mortas', 'Between springs and neaps');
  const cmpL = d => { const c = compass(d); return LANG === 'pt' && CMP_PT[c] ? CMP_PT[c] : c; };
  const windL = w => { const a = String(w).split(' '); return LANG === 'pt' && CMP_PT[a[0]] ? [CMP_PT[a[0]]].concat(a.slice(1)).join(' ') : w; };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const DOWL = () => LANG === 'pt' ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] : DOW;
  const MONL = () => LANG === 'pt' ? ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] : MON;
  const dayName = x => isToday(x) ? L('Hoje', 'Today') : isToday(addDays(x, -1)) ? L('Amanhã', 'Tomorrow') : `${DOWL()[x.dow]} ${x.d} ${MONL()[x.m]}`;
  const dayOf = t => { const p = ukParts(t); return { y: p.y, m: p.m, d: p.d, dow: p.dow }; };
  const dateLong = t => { const p = ukParts(t); return `${DOWL()[p.dow]} ${p.d} ${MONL()[p.m]}`; };
  const HWL = q => q.type === 'HW' ? L('PM', 'HW') : L('BM', 'LW');
  const m1 = h => (Math.round(h * 10) / 10).toFixed(1).replace('.', LANG === 'pt' ? ',' : '.');
  const tempAt = t => { const i = wxHourIdx(t); if (i >= 0 && LIVE.wx.hourly.temperature_2m) return Math.round(LIVE.wx.hourly.temperature_2m[i]); const p = ukParts(t), w = dailyWx(p.y, p.m, p.d); return w ? Math.round(w.tmax) : null; };
  const windAt = t => { const i = wxHourIdx(t); if (i < 0) return ''; const H = LIVE.wx.hourly; return `${cmpL(H.wind_direction_10m[i])} ${Math.round(H.wind_speed_10m[i])} mph`; };
  async function getJSON(url, ms) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ac) ac.abort(); }, ms || 15000);
    try { const r = await fetch(url, { cache: 'no-store', signal: ac ? ac.signal : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; }
    finally { clearTimeout(timer); }
  }
  let toastT = 0;
  function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }

  // ---------- screens: a stack; the bezel moves, a tap chooses, the Back key goes back ----------
  const scr = document.getElementById('screen');
  const stack = [];
  const top = () => stack[stack.length - 1];
  function show(v) { if (v.focus == null) v.focus = v.head ? -1 : 0; stack.push(v); draw(true); }
  function back() { if (stack.length > 1) { stack.pop(); draw(); } else if (TZ) { try { TZ.application.getCurrentApplication().hide(); } catch (err) {} } }
  function home() { stack.length = 1; draw(true); }
  function draw(reset) {
    tick();
    const v = top(); if (!v) return;
    const prev = scr.querySelector('.scroll'), keep = !reset && prev ? prev.scrollTop : 0;
    if (v.kind === 'pick') { scr.innerHTML = v.html(v); bindPick(v); return; }
    const head = v.head ? v.head() : '', items = v.items ? v.items() : [];
    v._items = items;
    if (v.focus >= items.length) v.focus = items.length - 1;
    scr.innerHTML = `<div class="scroll">${v.title ? `<h1>${esc(v.title())}</h1>` : ''}${head}${items.map((it, i) => `<div class="item${it.cls ? ' ' + it.cls : ''}${i === v.focus ? ' on' : ''}" data-i="${i}"><div class="t">${it.t}</div>${it.s ? `<div class="s">${it.s}</div>` : ''}</div>`).join('')}</div>`;
    const sc = scr.querySelector('.scroll');
    sc.style.scrollBehavior = 'auto'; sc.scrollTop = keep; sc.style.scrollBehavior = '';
    // if the first choice is already on screen, the orange ring starts on it
    if (reset && v.focus < 0 && items.length) { const f = sc.querySelector('.item'); if (f && f.offsetTop + f.offsetHeight <= sc.clientHeight - 20) { v.focus = 0; f.classList.add('on'); } }
    sc.querySelectorAll('.item').forEach(el => el.addEventListener('click', () => { const it = items[+el.dataset.i]; v.focus = +el.dataset.i; if (it && it.go) it.go(); }));
  }
  function focusItem(v) {
    const sc = scr.querySelector('.scroll'); if (!sc) return;
    sc.querySelectorAll('.item').forEach((el, i) => el.classList.toggle('on', i === v.focus));
    const el = sc.querySelector(`.item[data-i="${v.focus}"]`);
    if (el) sc.scrollTop = el.offsetTop - sc.clientHeight / 2 + el.offsetHeight / 2;
  }
  function rotate(dir) {
    const v = top(); if (!v) return;
    if (v.kind === 'pick') { v.turn(dir); return; }
    const sc = scr.querySelector('.scroll'), n = (v._items || []).length; if (!sc) return;
    if (!n) { sc.scrollTop += dir * 70; return; }
    if (dir > 0) {
      if (v.focus < 0) { const first = sc.querySelector('.item'); if (first && first.offsetTop + first.offsetHeight > sc.scrollTop + sc.clientHeight - 30) { sc.scrollTop += 70; return; } }
      if (v.focus < n - 1) { v.focus++; focusItem(v); } else sc.scrollTop += 70;
    } else {
      if (v.focus > 0) { v.focus--; focusItem(v); return; }
      if (v.head) { v.focus = -1; focusItem(v); sc.scrollTop -= 70; } else sc.scrollTop -= 70;
    }
  }
  document.addEventListener('rotarydetent', ev => rotate(ev.detail && ev.detail.direction === 'CW' ? 1 : -1));
  document.addEventListener('wheel', ev => { ev.preventDefault(); rotate(ev.deltaY > 0 ? 1 : -1); }, { passive: false }); // for testing on a computer
  document.addEventListener('keydown', ev => { if (ev.key === 'ArrowDown') rotate(1); else if (ev.key === 'ArrowUp') rotate(-1); else if (ev.key === 'Escape' || ev.key === 'Backspace') back(); else if (ev.key === 'Enter') { const v = top(); if (v.kind === 'pick') v.ok(); else { const it = (v._items || [])[v.focus]; if (it && it.go) it.go(); } } });
  document.addEventListener('tizenhwkey', ev => { if (ev.keyName === 'back') back(); });

  // a list that is just choices
  const list = (title, items, head) => ({ title: typeof title === 'function' ? title : () => title, items, head });
  // a number picker: turn the bezel, tap OK
  function numberPick(o) {
    let v = o.value;
    const view = {
      kind: 'pick',
      html: () => `<div class="pick"><h1>${esc(o.title)}</h1><div class="v">${o.fmt ? o.fmt(v) : v}</div><div class="u">${esc(o.unit || '')}</div>${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}<div class="ok" id="pk-ok">OK</div>${o.skip ? `<div class="skip" id="pk-skip">${esc(o.skip)}</div>` : ''}</div>`,
      turn: d => { v = Math.max(o.min, Math.min(o.max, Math.round((v + d * o.step) * 100) / 100)); const el = scr.querySelector('.v'); if (el) el.textContent = o.fmt ? o.fmt(v) : v; },
      ok: () => o.done(v)
    };
    return view;
  }
  function bindPick(v) {
    const ok = document.getElementById('pk-ok'), sk = document.getElementById('pk-skip'), val = scr.querySelector('.v');
    if (ok) ok.addEventListener('click', () => v.ok());
    if (val) val.addEventListener('click', () => v.ok());
    if (sk) sk.addEventListener('click', () => v.skipIt ? v.skipIt() : v.ok(null));
    if (v.bind) v.bind();
  }

  // ---------- location ----------
  function setLocW(l) {
    LOC = l; lsSet('sh-loc', JSON.stringify(l));
    setGeo(l.lat, l.lon); applyPack();
    LIVE.wx = null; LIVE.sea = null; LIVE.tide = null; LIVE.adm = null; LIVE.warn = null; LIVE.wxAt = 0; LIVE.ver++;
    draw(); loadLive(true);
  }
  function askLocation() {
    return new Promise(res => {
      if (TZ && TZ.ppm) {
        try {
          const st = TZ.ppm.checkPermission('http://tizen.org/privilege/location');
          if (st === 'PPM_ALLOW') return res(true);
          TZ.ppm.requestPermission('http://tizen.org/privilege/location', r => res(r === 'PPM_ALLOW_FOREVER' || r === 'PPM_ALLOW_ONCE'), () => res(false));
          return;
        } catch (err) {}
      }
      res(true);
    });
  }
  function nearName(lat, lon) {
    const all = myspots().map(s => ({ n: '★ ' + s.n, lat: s.lat, lon: s.lon })).concat(SPOTS, PLACES);
    const n = all.map(s => ({ s, d: km(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d)[0];
    return n && n.d < 3 ? n.s.n : null;
  }
  async function getGPS(quiet) {
    if (!(await askLocation()) || !navigator.geolocation) { if (!quiet) toast(L('Localização bloqueada. Autoriza nas definições do relógio.', 'Location is blocked. Allow it in the watch settings.')); return null; }
    if (!quiet) toast(L('A procurar o GPS… fica ao ar livre.', 'Finding GPS… stay outside.'));
    return new Promise(res => navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      () => { if (!quiet) toast(L('Sem GPS agora. Tenta ao ar livre.', 'No GPS fix. Try outside.')); res(null); },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5 * 60000 }));
  }
  async function useGPS(quiet) {
    const p = await getGPS(quiet); if (!p) return;
    let name = nearName(p.lat, p.lon);
    if (!name) { try { const g = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.lat}&longitude=${p.lon}&localityLanguage=en`, 8000); name = g.locality || g.city || g.principalSubdivision; } catch (err) {} }
    setLocW({ mode: 'gps', lat: p.lat, lon: p.lon, name: name || `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` });
  }

  // ---------- live data: the same sources as the phone app, through the same Worker ----------
  async function loadLive(force) {
    if (LIVE.loading) return;
    if (!force && LIVE.wx && Date.now() - LIVE.wxAt < 20 * MIN && LIVE.adm && LIVE.adm.key === locKey()) return;
    LIVE.loading = true; LIVE.err = ''; draw();
    const key = locKey(), q = `lat=${LOC.lat.toFixed(2)}&lon=${LOC.lon.toFixed(2)}`;
    try { const j = await getJSON(`${BASE}/api/tides?${q}`); if (j.events && j.events.length) LIVE.adm = { key, station: j.station, events: j.events, at: Date.now() }; LIVE.admErr = ''; }
    catch (err) { LIVE.admErr = String(err.message || err); }
    const rg = warnRegion();
    if (rg) { try { const j = await getJSON(`${BASE}/api/warnings?${rg.indexOf('ipma-') === 0 ? 'src=ipma&area=' + rg.slice(5) : 'region=' + rg}`); LIVE.warn = { region: rg, items: j.items || [], at: Date.now() }; } catch (err) {} } else LIVE.warn = null;
    try {
      LIVE.wx = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${LOC.lat.toFixed(4)}&longitude=${LOC.lon.toFixed(4)}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,precipitation,pressure_msl&hourly=temperature_2m,precipitation,pressure_msl,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_probability_max&wind_speed_unit=mph&timezone=Europe%2FLondon&timeformat=unixtime&past_days=2&forecast_days=7`);
      LIVE.wxAt = Date.now();
    } catch (err) { LIVE.err = L('Sem internet: a mostrar os últimos dados.', 'Offline: showing the last saved data.'); }
    const L0 = LOC.lat, G0 = LOC.lon, pts = inSolent() ? [[50.79, -1.30], [50.77, -1.22], [50.74, -1.12]] : [[L0, G0], [L0 - 0.06, G0], [L0 - 0.12, G0], [L0, G0 - 0.1], [L0, G0 + 0.1], [L0 + 0.06, G0]];
    for (const pt of pts) {
      try {
        const m = await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${pt[0]}&longitude=${pt[1]}&hourly=sea_level_height_msl,wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature&timezone=GMT&timeformat=unixtime&past_days=2&forecast_days=8`);
        const H = m.hourly || {}, lv = H.sea_level_height_msl || [];
        if (lv.filter(v => v != null).length > 48) { const ex = extremesFrom(H.time, lv); if (ex.length > 8) { LIVE.tide = ex; LIVE.tideAt = Date.now(); LIVE.tideKey = key; } }
        if ((H.wave_height || []).some(v => v != null)) LIVE.sea = { time: H.time, wh: H.wave_height, wp: H.wave_period, wd: H.wave_direction, sh: H.swell_wave_height, sp: H.swell_wave_period, sd: H.swell_wave_direction, sst: H.sea_surface_temperature };
        if (LIVE.tide && LIVE.tideKey === key) break;
      } catch (err) { /* try the next point */ }
    }
    LIVE.ver++; LIVE.loading = false;
    if (key !== locKey()) return;
    try { localStorage.setItem('sh-live', JSON.stringify({ at: Date.now(), key, wx: LIVE.wx, wxAt: LIVE.wxAt, tide: LIVE.tide, tideAt: LIVE.tideAt, sea: LIVE.sea })); } catch (err) {}
    lsSet('sh-w-adm', JSON.stringify(LIVE.adm || null));
    draw(); scheduleAlerts();
  }
  { const a = lsJSON('sh-w-adm', null); if (a && a.key === locKey() && Date.now() - a.at < 6 * HOUR) LIVE.adm = a; }
  const ago = t => { const m = Math.round((Date.now() - t) / MIN); return m < 1 ? L('agora', 'just now') : m < 60 ? L(`há ${m} min`, `${m} min ago`) : L(`há ${Math.round(m / 60)} h`, `${Math.round(m / 60)} h ago`); };
  const status = () => LIVE.loading ? L('A atualizar…', 'Updating…') : LIVE.wx ? L('Atualizado ', 'Updated ') + ago(LIVE.wxAt) : L('Sem dados ao vivo', 'No live data');

  // ---------- link to the phone app: the same backup code, the same online copy ----------
  const SYNC_RE = /^SH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  let CODE = ls('sh-sync', '');
  let QUEUE = lsJSON('sh-w-queue', []);         // catches and spots made on the watch, waiting to go online
  let CLOUD = lsJSON('sh-w-cloud', { spots: [], catches: [], total: 0, at: 0 });
  let syncing = false;
  const saveQ = () => lsSet('sh-w-queue', JSON.stringify(QUEUE));
  const myspots = () => (CLOUD.spots || []).concat(QUEUE.filter(x => x.k === 'p').map(x => x.item)).filter((s, i, a) => s && typeof s.lat === 'number' && a.findIndex(o => o.id === s.id) === i);
  const watchCatches = () => QUEUE.filter(x => x.k === 'c').map(x => x.item);
  async function syncWatch() {
    if (syncing || !SYNC_RE.test(CODE)) return;
    syncing = true;
    try {
      if (QUEUE.length) {
        const send = QUEUE.slice();
        const r = await fetch(`${BASE}/api/sync`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ code: CODE, put: send, del: [] }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        QUEUE = QUEUE.filter(x => send.indexOf(x) < 0); saveQ();
        // keep a copy of what this watch logged so it still shows before the next download
        CLOUD.catches = send.filter(x => x.k === 'c').map(x => x.item).concat(CLOUD.catches || []);
        CLOUD.spots = (CLOUD.spots || []).concat(send.filter(x => x.k === 'p').map(x => x.item));
      }
      const sum = await getJSON(`${BASE}/api/sync?code=${encodeURIComponent(CODE)}`);
      const lastC = sum.ids.slice().sort().slice(-15), need = sum.spotIds.concat(lastC), got = [];
      for (let i = 0; i < need.length; i += 25) {
        const j = await getJSON(`${BASE}/api/sync?code=${encodeURIComponent(CODE)}&ids=${need.slice(i, i + 25).join(',')}`, 30000);
        (j.items || []).forEach(x => got.push(x));
      }
      CLOUD = {
        spots: got.filter(x => x.k === 'p').map(x => x.item),
        catches: got.filter(x => x.k === 'c').map(x => { const c = Object.assign({}, x.item); delete c.photo; return c; }).sort((a, b) => b.t - a.t),
        total: sum.ids.length, at: Date.now()
      };
      lsSet('sh-w-cloud', JSON.stringify(CLOUD));
    } catch (err) { /* offline: try again next time */ }
    syncing = false; draw();
  }
  function enqueue(k, item) { QUEUE.push({ k, item }); saveQ(); syncWatch(); }

  // ---------- notifications: best times, full and new moon ----------
  function phaseEventsW(start, days) {
    const out = [], step = 3 * HOUR, Q = [[0, 'New moon'], [0.25, 'First quarter'], [0.5, 'Full moon'], [0.75, 'Last quarter']];
    let pv = moonPhase(start).phase;
    for (let t = start + step; t < start + days * dayMs; t += step) {
      const cv = moonPhase(t).phase;
      Q.forEach(q => { let hit = false, f = 0;
        if (q[0] === 0) { if (pv > 0.9 && cv < 0.1) { hit = true; f = (1 - pv) / (cv + 1 - pv); } } else if (pv < q[0] && cv >= q[0]) { hit = true; f = (q[0] - pv) / (cv - pv); }
        if (hit) out.push({ t: t - step + f * step, name: q[1], q: q[0] }); });
      pv = cv;
    }
    return out;
  }
  const notifOn = () => ls('sh-w-notif', '1') === '1';
  function scheduleAlerts() {
    if (!TZ || !TZ.alarm) return;
    try { TZ.alarm.removeAll(); } catch (err) {}
    if (!notifOn()) { lsSet('sh-w-alerts', '{}'); return; }
    let appId = ''; try { appId = TZ.application.getCurrentApplication().appInfo.id; } catch (err) { return; }
    const plan = {}, soon = Date.now() + 2 * MIN;
    bestWindows().forEach(o => { const at = Math.round(o.s - 30 * MIN); if (at > soon) plan[at] = { k: 'best', s: o.s, e: o.e, why: o.why, prime: o.sc >= 7 }; });
    phaseEventsW(Date.now() - 12 * HOUR, 15).filter(ev => ev.q === 0 || ev.q === 0.5).forEach(ev => {
      const p = ukParts(ev.t), at = ukMidnight(p.y, p.m, p.d) + 8 * HOUR; if (at > soon) plan[at] = { k: 'moon', t: ev.t, name: ev.name };
    });
    Object.keys(plan).forEach(at => { try { TZ.alarm.add(new TZ.AlarmAbsolute(new Date(+at)), appId, new TZ.ApplicationControl(ALERT_OP)); } catch (err) {} });
    lsSet('sh-w-alerts', JSON.stringify(plan));
  }
  function nextTideText(D, t) {
    const all = D.tides.concat(computeDay(...(x => [x.y, x.m, x.d])(addDays(dayOf(t), 1))).tides).filter(q => q.t > t).slice(0, 2);
    return all.map(q => `${HWL(q)} ${fmt(q.t)}${q.hNull ? '' : ' ' + m1(q.h) + ' m'}`).join(', ');
  }
  function alertText(p) {
    const t = p.k === 'best' ? p.s : ukMidnight(...(x => [x.y, x.m, x.d])(dayOf(p.t))) + 12 * HOUR;
    const D = computeDay(...(x => [x.y, x.m, x.d])(dayOf(t)));
    const tdp = D.tides.length ? tidePhase(D.tides, p.k === 'best' ? p.s : Date.now()) : null;
    const tmp = tempAt(p.k === 'best' ? p.s : t), wind = windAt(p.k === 'best' ? p.s : t);
    const bits = [dateLong(t)];
    if (p.k === 'best') {
      if (tdp) bits.push(T(tdp.label));
      const nt = nextTideText(D, p.s); if (nt) bits.push(nt);
      if (tmp != null) bits.push(tmp + '°C');
      if (wind) bits.push(L('vento ', 'wind ') + wind);
      bits.push(T(phaseName(moonPhase(p.s).phase)));
      return { title: `🎣 ${p.prime ? L('Hora nobre', 'Prime time') : L('Melhor hora', 'Best time')} ${fmt(p.s)}–${fmt(p.e)}`, body: bits.join(' · ') };
    }
    bits.push(springL(D.sp));
    const hw = D.tides.filter(q => q.type === 'HW' && q.t >= D.start && q.t < D.end).map(q => fmt(q.t)); if (hw.length) bits.push(L('PM ', 'HW ') + hw.join(' / '));
    if (tmp != null) bits.push(tmp + '°C');
    const b = bestWindows().find(o => o.x.d === dayOf(t).d); if (b) bits.push(L('melhor ', 'best ') + fmt(b.s) + '–' + fmt(b.e));
    return { title: p.name === 'Full moon' ? L('🌕 Lua cheia hoje', '🌕 Full moon today') : L('🌑 Lua nova hoje', '🌑 New moon today'), body: bits.join(' · ') };
  }
  function postNote(n) {
    if (!TZ || !TZ.notification) return;
    try { TZ.notification.post(new TZ.UserNotification('SIMPLE', n.title, { content: n.body })); }
    catch (err) { try { TZ.notification.post(new TZ.StatusNotification('SIMPLE', n.title, { content: n.body, vibration: true })); } catch (e2) {} }
  }
  const launchedForAlert = () => { try { const r = TZ.application.getCurrentApplication().getRequestedAppControl(); return !!(r && r.appControl && r.appControl.operation === ALERT_OP); } catch (err) { return false; } };
  async function fireDueAlerts(exitAfter) {
    const plan = lsJSON('sh-w-alerts', {}), nowMs = Date.now();
    const due = Object.keys(plan).filter(at => +at <= nowMs + 5 * MIN && +at > nowMs - 3 * HOUR);
    if (!due.length) return;
    await Promise.race([loadLive(true), sleep(15000)]); // fresh temperature and wind if there's internet
    due.forEach(at => { postNote(alertText(plan[at])); delete plan[at]; });
    lsSet('sh-w-alerts', JSON.stringify(plan));
    scheduleAlerts();
    if (exitAfter) { await sleep(800); try { TZ.application.getCurrentApplication().exit(); } catch (err) {} }
  }
  window.addEventListener('appcontrol', () => { if (launchedForAlert()) fireDueAlerts(false); });

  // ---------- screens ----------
  const tideNow = D => {
    if (!D.tides.length) return '';
    const st = tideState(D.tides, now), h = tideAt(D.tides, now), nt = nextTideText(D, now);
    return `<div class="box tide"><div class="lbl" style="margin:0">${L('Maré agora', 'Tide now')}</div><b>${esc(T(st))}</b> · ${m1(h)} m<div class="mut">${L('Próximas: ', 'Next: ')}${esc(nt)}</div></div>`;
  };
  const tideSrc = D => D.adm ? `ADMIRALTY${LIVE.adm && LIVE.adm.station ? ' · ' + esc(LIVE.adm.station.name) : ''}` : D.live ? L('modelo ao vivo (aproximado)', 'live model (approximate)') : L('estimativa pela lua', 'estimated from the moon');

  function rootView() {
    return list(() => 'Santos Tides', () => {
      const x = dayOf(now), D = computeDay(x.y, x.m, x.d), R = dayRating(D), b = bestWindows()[0];
      const it = [
        { t: '📅 ' + L('Hoje', 'Today'), s: `${starStr(R.s)} ${esc(T(RATING[R.s]))}`, go: () => show(dayView(x)) },
        { t: '🎣 ' + L('Melhores horas', 'Best times'), s: b ? `${esc(dayName(b.x))} ${fmt(b.s)}–${fmt(b.e)}` : '', go: () => show(bestView()) },
        { t: '🗓 ' + L('Semana', 'Week'), go: () => show(weekView()) },
        { t: '🎯 ' + L('Alvo', 'Target'), s: L('melhores horas por peixe', 'best times by fish'), go: () => show(targetList()) },
        { t: '🌊 ' + L('Marés', 'Tides'), go: () => show(tidesView()) },
        { t: '🌙 ' + L('Lua', 'Moon'), s: esc(T(phaseName(D.ph.phase))), go: () => show(moonView()) },
        { t: '💨 ' + L('Vento e mar', 'Wind & sea'), s: LIVE.wx && LIVE.wx.current ? `${esc(cmpL(LIVE.wx.current.wind_direction_10m))} ${Math.round(LIVE.wx.current.wind_speed_10m)} mph · ${Math.round(LIVE.wx.current.temperature_2m)}°C` : '', go: () => show(windView()) }
      ];
      if (LIVE.warn && LIVE.warn.items.length) it.push({ t: '⚠️ ' + L('Avisos', 'Warnings'), s: LIVE.warn.items.length + ' ' + esc(warnSrc()), cls: 'prime', go: () => show(warnView()) });
      it.push(
        { t: '🐟 ' + L('Peixes do mês', 'Fish this month'), go: () => show(fishList()) },
        { t: '📍 ' + L('Locais', 'Spots'), go: () => show(spotsView()) },
        { t: '➕ ' + L('Registar captura', 'Log a catch'), cls: 'go', go: () => startCatch() },
        { t: '📒 ' + L('As minhas capturas', 'My catches'), s: CLOUD.total ? CLOUD.total + L(' no registo', ' in the log') : '', go: () => show(catchesView()) },
        { t: '⚙️ ' + L('Definições', 'Settings'), go: () => show(settingsView()) }
      );
      return it;
    }, () => {
      const x = dayOf(now), D = computeDay(x.y, x.m, x.d), R = dayRating(D);
      return `<div class="sub">📍 ${esc(LOC.name)}</div><div class="stars">${starStr(R.s)}</div>${tideNow(D)}<div class="sub" style="margin-top:6px">${status()}${SYNC_RE.test(CODE) ? ' · 🔗' : ''}</div>`;
    });
  }

  function dayView(x) {
    return list(() => dayName(x), () => {
      const nx = addDays(x, 1), pv = addDays(x, -1), it = [{ t: L('Dia seguinte ›', 'Next day ›'), go: () => { stack.pop(); show(dayView(nx)); } }];
      if (!isToday(x)) it.push({ t: L('‹ Dia anterior', '‹ Previous day'), go: () => { stack.pop(); show(dayView(pv)); } });
      return it;
    }, () => {
      const D = computeDay(x.y, x.m, x.d), R = dayRating(D), today = isToday(x), h = [];
      h.push(`<div class="sub">📍 ${esc(LOC.name)}</div><div class="stars">${starStr(R.s)}</div><div class="c">${esc(T(RATING[R.s]))}</div>`);
      if (R.notes.length) h.push(`<div class="c">${R.notes.map(n => `<span class="chip r">${esc(T(n))}</span>`).join('')}</div>`);
      if (today) h.push(tideNow(D));
      if (D.tides.length) h.push(`<div class="box tide"><div class="lbl" style="margin:0">${L('Marés', 'Tides')}</div>${D.tides.filter(q => q.t >= D.start && q.t < D.end).map(q => `<div class="row2"><span>${HWL(q)} ${fmt(q.t)}</span><span>${q.hNull ? '' : m1(q.h) + ' m'}</span></div>`).join('')}<div class="mut">${tideSrc(D)}</div></div>`);
      const sp = goodSpells(D);
      if (sp.length) h.push(`<div class="box prime"><div class="lbl" style="margin:0">${L('Boas horas', 'Good spells')}</div>${sp.map(s => `<div><b>${fmt(s.s)}–${fmt(s.e)}</b> <span class="mut">${esc(T(s.label))}</span></div>`).join('')}</div>`);
      h.push(`<div class="box"><div class="moonrow">${moonSVG(D.ph.phase, D.ph.frac, 54)}</div><div class="c">${esc(T(phaseName(D.ph.phase)))} · ${Math.round(D.ph.frac * 100)}%</div><div class="mut c">${esc(springL(D.sp))}</div></div>`);
      h.push(`<div class="box"><div class="row2"><span>🌅 ${D.sunrise ? fmt(D.sunrise) : '—'}</span><span>🌇 ${D.sunset ? fmt(D.sunset) : '—'}</span></div></div>`);
      const W = LIVE.wx;
      if (today && W && W.current) {
        const c = W.current, ww = windWord(c.wind_speed_10m, c.wind_gusts_10m), pr = pressureInfo(), sea = seaAt(now);
        h.push(`<div class="box ${ww.c}"><b>${esc(cmpL(c.wind_direction_10m))} ${Math.round(c.wind_speed_10m)} mph</b> · ${L('rajadas', 'gusts')} ${Math.round(c.wind_gusts_10m)}<div>${esc(T(wcode(c.weather_code)))} · ${Math.round(c.temperature_2m)}°C</div><div class="mut">${esc(T(ww.t))}</div></div>`);
        if (sea && sea.wh != null) h.push(`<div class="box tide">${L('Ondas', 'Waves')} ${m1(sea.wh)} m${sea.sh != null ? ' · ' + L('ondulação', 'swell') + ' ' + m1(sea.sh) + ' m' : ''}${sea.sst != null ? ' · ' + L('mar', 'sea') + ' ' + m1(sea.sst) + '°C' : ''}</div>`);
        if (pr) h.push(`<div class="box ${pr.cls}"><b>${pr.now} hPa</b> · ${esc(T(pr.word))}<div class="mut">${esc(T(pr.tip))}</div></div>`);
      } else {
        const w = dailyWx(x.y, x.m, x.d);
        if (w) h.push(`<div class="box">${esc(T(wcode(w.code)))} · ${Math.round(w.tmin)}–${Math.round(w.tmax)}°C<div>${esc(cmpL(w.dir))} ${Math.round(w.w)} mph · ${L('rajadas', 'gusts')} ${Math.round(w.g)}${w.rain != null ? ' · 🌧 ' + w.rain + '%' : ''}</div></div>`);
        const sd = seaDay(D.start, D.end); if (sd && sd.wh != null) h.push(`<div class="box tide">${L('Ondas até', 'Waves up to')} ${m1(sd.wh)} m${sd.sh != null ? ' · ' + L('ondulação', 'swell') + ' ' + m1(sd.sh) + ' m' : ''}</div>`);
      }
      const cl = clarityAt(today ? now : D.start + 12 * HOUR);
      if (cl) h.push(`<div class="box ${cl.cls}"><b>${L('Água: ', 'Water: ')}${esc(T(cl.label))}</b><div class="mut">${esc(T(cl.tip))}</div></div>`);
      const s = spotHere(); if (today && s && FACE[s.n] != null && W && W.current) { const r = windRel(FACE[s.n], W.current.wind_direction_10m, W.current.wind_speed_10m); h.push(`<div class="box ${r.cls}"><b>${esc(T(r.t))}</b><div class="mut">${esc(T(r.tip))}</div></div>`); }
      return h.join('');
    });
  }

  function weekView() {
    return list(() => L('Semana', 'Week'), () => {
      const out = [];
      for (let i = 0; i < 7; i++) {
        const x = addDays(dayOf(now), i), D = computeDay(x.y, x.m, x.d), R = dayRating(D), w = dailyWx(x.y, x.m, x.d);
        out.push({ t: esc(dayName(x)), s: `${starStr(R.s)}${w ? ` · ${Math.round(w.tmax)}°C · ${esc(cmpL(w.dir))} ${Math.round(w.w)} mph` : ''}`, cls: R.s >= 4 ? 'prime' : '', go: () => show(dayView(x)) });
      }
      return out;
    });
  }

  function bestView() {
    return list(() => L('Melhores horas', 'Best times'), () => bestWindows().map(o => ({
      t: `${esc(dayName(o.x))} ${fmt(o.s)}–${fmt(o.e)}${o.sc >= 7 ? ' ★' : ''}`,
      s: esc(o.why.slice(0, 3).map(T).join(' · ')) + (o.wind ? ` · ${esc(windL(o.wind))}` : ''),
      cls: o.sc >= 7 ? 'prime' : '', go: () => show(dayView(o.x))
    })), () => `<div class="sub">📍 ${esc(LOC.name)} · ${L('maré e lua primeiro', 'tide and moon first')}</div>`);
  }

  const inSeasonSort = arr => arr.slice().sort((a, b) => (b.p.includes(tp.m) - a.p.includes(tp.m)) || (b.m.includes(tp.m) - a.m.includes(tp.m)));
  function targetList() {
    return list(() => L('Alvo', 'Target'), () => inSeasonSort(FISH.filter(f => !f.ret && !f.warn)).map(f => ({
      t: esc(T(f.n)) + (f.p.includes(tp.m) ? ' ★' : ''), s: f.m.includes(tp.m) ? L('em época', 'in season') : L('fora de época', 'out of season'), go: () => show(targetView(f.n))
    })));
  }
  function targetView(name) {
    return list(() => T(name), () => {
      const r = targetBest(name), it = r.pick.map(s => ({ t: `${esc(dayName(s.x))} ${fmt(s.t - 30 * MIN)}–${fmt(s.t + 30 * MIN)}${s.sc >= 7 ? ' ★' : ''}`, s: esc(s.why.slice(0, 3).map(T).join(' · ')), cls: s.sc >= 7 ? 'prime' : '', go: () => show(dayView(s.x)) }));
      it.push({ t: L('➕ Registar este peixe', '➕ Log this fish'), cls: 'go', go: () => startCatch(name) });
      return it;
    }, () => {
      const r = targetBest(name), f = r.f, P = r.P, tip = (TGT[name] && TGT[name].tip) || (f && f.k && f.tip) || P.tip || (f ? f.tip : '');
      const marks = SPOTS.filter(s => s.fish.includes(name)).map(s => ({ s, d: km(LOC.lat, LOC.lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d).slice(0, 3);
      return `${f ? `<div class="c">${f.p.includes(tp.m) ? `<span class="chip r">${L('Época alta', 'Peak season')}</span>` : f.m.includes(tp.m) ? `<span class="chip">${L('Em época', 'In season')}</span>` : `<span class="chip">${L('Fora de época', 'Out of season')}</span>`}</div>` : ''}
        <div class="mut c" style="margin:6px 0">${esc(T(tip))}</div>
        ${f ? `<div class="lbl">${L('Isco', 'Bait')}</div><div>${f.bait.map(b => `<span class="chip">${esc(T(b))}</span>`).join('')}</div>` : ''}
        ${P.rig ? `<div class="lbl">${L('Montagem', 'Rig')}</div><div>${esc(T(P.rig))}</div>` : ''}
        ${marks.length ? `<div class="lbl">${L('Locais', 'Marks')}</div><div>${marks.map(m => `<span class="chip">${esc(m.s.n)} · ${Math.round(m.d)} km</span>`).join('')}</div>` : ''}
        <div class="lbl">${L('Melhores horas', 'Best times')}</div>`;
    });
  }

  function tidesView() {
    return list(() => L('Marés', 'Tides'), null, () => {
      const out = [];
      for (let i = 0; i < 7; i++) {
        const x = addDays(dayOf(now), i), D = computeDay(x.y, x.m, x.d), ev = D.tides.filter(q => q.t >= D.start && q.t < D.end);
        out.push(`<div class="box tide"><div class="lbl" style="margin:0">${esc(dayName(x))} · ${esc(springL(D.sp))}</div>${ev.length ? ev.map(q => `<div class="row2"><span>${HWL(q)} ${fmt(q.t)}</span><span>${q.hNull ? '' : m1(q.h) + ' m'}</span></div>`).join('') : `<div class="mut">${L('Sem marés para aqui', 'No tides for here')}</div>`}</div>`);
      }
      const D0 = computeDay(tp.y, tp.m, tp.d);
      return `<div class="sub">📍 ${esc(LOC.name)}</div>` + out.join('') + `<div class="mut c">${tideSrc(D0)}${D0.adm ? '<br>Contains ADMIRALTY® tidal data: © Crown Copyright.' : ''}</div>`;
    });
  }

  function moonView() {
    return list(() => L('Lua', 'Moon'), null, () => {
      const D = computeDay(tp.y, tp.m, tp.d), ph = moonPhase(now);
      const rises = D.moon.map(m => `${m.type === 'rise' ? L('Nasce', 'Rises') : L('Põe-se', 'Sets')} ${fmt(m.t)}`).join(' · ');
      const wins = D.wins.filter(w => w.kind === 'major' || w.kind === 'minor').map(w => `<div${w.prime ? ' style="color:var(--rust)"' : ''}><b>${fmt(w.s)}–${fmt(w.e)}</b> ${esc(T(w.label))}</div>`).join('');
      const evs = phaseEventsW(now, 30).map(e => `<div class="row2"><span>${esc(T(e.name))}</span><span>${esc(dateLong(e.t))}</span></div>`).join('');
      return `<div class="moonrow">${moonSVG(ph.phase, ph.frac, 90)}</div><div class="mid">${esc(T(phaseName(ph.phase)))}</div><div class="c mut">${Math.round(ph.frac * 100)}% · ${esc(springL(D.sp))}</div>
        ${rises ? `<div class="box">${rises}</div>` : ''}${wins ? `<div class="box prime"><div class="lbl" style="margin:0">${L('Solunar hoje', 'Solunar today')}</div>${wins}</div>` : ''}
        <div class="box"><div class="lbl" style="margin:0">${L('Próximas 4 semanas', 'Next 4 weeks')}</div>${evs}</div>`;
    });
  }

  function windView() {
    return list(() => L('Vento e mar', 'Wind & sea'), () => [{ t: L('🔄 Atualizar', '🔄 Refresh'), go: () => loadLive(true) }], () => {
      const W = LIVE.wx;
      if (!W) return `<div class="mut c">${L('Sem dados. Liga a internet (Wi-Fi ou o telemóvel).', 'No data. Connect to the internet (Wi-Fi or the phone).')}</div>`;
      const c = W.current, ww = c ? windWord(c.wind_speed_10m, c.wind_gusts_10m) : null, rows = [];
      for (let t = Math.floor(now / HOUR) * HOUR; t < now + 13 * HOUR; t += HOUR) {
        const i = wxHourIdx(t); if (i < 0) continue;
        const H = W.hourly, s = seaAt(t + 30 * MIN);
        rows.push(`<div class="row2"><span>${fmt(t)}</span><span>${esc(cmpL(H.wind_direction_10m[i]))} <b>${Math.round(H.wind_speed_10m[i])}</b>/${Math.round(H.wind_gusts_10m[i])}</span><span>${H.precipitation_probability[i] == null ? '' : H.precipitation_probability[i] + '%'}</span><span>${s && s.wh != null ? m1(s.wh) + 'm' : ''}</span></div>`);
      }
      return `<div class="sub">${status()}</div>${c ? `<div class="big">${Math.round(c.wind_speed_10m)}<span style="font-size:18px"> mph</span></div><div class="c">${esc(cmpL(c.wind_direction_10m))} · ${L('rajadas', 'gusts')} ${Math.round(c.wind_gusts_10m)} · ${Math.round(c.temperature_2m)}°C</div><div class="box ${ww.c}">${esc(T(ww.t))}</div>` : ''}
        <div class="box"><div class="lbl" style="margin:0">${L('Hora a hora · vento/rajada · chuva · ondas', 'Hourly · wind/gust · rain · waves')}</div>${rows.join('')}</div>`;
    });
  }

  function warnView() {
    return list(() => L('Avisos', 'Warnings'), null, () => (LIVE.warn && LIVE.warn.items.length ? LIVE.warn.items.slice(0, 6).map(i => `<div class="box bad"><b>${esc(i.title)}</b>${i.desc ? `<div class="mut">${esc(String(i.desc).slice(0, 220))}</div>` : ''}</div>`).join('') : `<div class="mut c">${L('Sem avisos.', 'No warnings.')}</div>`) + `<div class="mut c">${esc(warnSrc())}</div>`);
  }

  function fishList() {
    return list(() => L('Peixes do mês', 'Fish this month'), () => inSeasonSort(FISH.filter(f => f.m.includes(tp.m))).map(f => ({
      t: esc(T(f.n)) + (f.p.includes(tp.m) ? ' ★' : ''), s: f.ret ? L('Tem de voltar à água', 'Must go back') : f.warn ? L('Cuidado: venenoso', 'Careful: venomous') : f.min ? L('Mín. ', 'Min ') + esc(T(f.min)) : L('Sem tamanho mínimo', 'No legal minimum'),
      cls: f.ret || f.warn ? 'prime' : '', go: () => show(fishView(f))
    })), () => `<div class="sub">${esc(L(MONL()[tp.m], MONTH[tp.m]))} · ${PACK === 'pt' ? 'Portugal' : PACK === 'mad' ? 'Madeira' : 'UK'}</div>`);
  }
  function fishView(f) {
    return list(() => T(f.n), () => {
      const it = [];
      if (!f.ret && !f.warn) it.push({ t: L('🎯 Melhores horas', '🎯 Best times'), go: () => show(targetView(f.n)) });
      it.push({ t: L('➕ Registar este peixe', '➕ Log this fish'), cls: 'go', go: () => startCatch(f.n) });
      return it;
    }, () => `<div class="mut c" style="font-style:italic">${esc(f.l)}</div>
      <div class="c">${f.ret ? `<span class="chip r">${L('Devolver', 'Must return')}</span>` : ''}${f.warn ? `<span class="chip r">${L('Venenoso', 'Venomous')}</span>` : ''}${f.p.includes(tp.m) ? `<span class="chip r">${L('Época alta', 'Peak')}</span>` : ''}</div>
      <div class="box"><div class="row2"><span>${L('Mínimo legal', 'Legal minimum')}</span><b>${f.min ? esc(T(f.min)) : '—'}</b></div>${f.rec ? `<div class="row2"><span>${L('Recomendado', 'Recommended')}</span><b>${esc(T(f.rec))}</b></div>` : ''}${f.bag ? `<div class="mut">${L('Limite: ', 'Bag: ')}${esc(T(f.bag))}</div>` : ''}<div class="mut">${esc(T(f.where))}</div></div>
      <div class="lbl">${L('Isco', 'Bait')}</div><div>${f.bait.map(b => `<span class="chip">${esc(T(b))}</span>`).join('')}</div>
      <div class="mut" style="margin-top:8px">${esc(T(f.tip))}</div>`);
  }

  function allPlaces() {
    return myspots().map(s => ({ my: true, n: s.n, lat: s.lat, lon: s.lon, note: s.notes || '' }))
      .concat(SPOTS.map(s => ({ s, n: s.n, lat: s.lat, lon: s.lon })), PLACES.map(s => ({ place: true, n: s.n, lat: s.lat, lon: s.lon })))
      .map(p => Object.assign(p, { d: km(LOC.lat, LOC.lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d);
  }
  const dist = d => d < 1 ? L('aqui', 'here') : Math.round(d) + ' km';
  function spotsView() {
    return list(() => L('Locais', 'Spots'), () => [{ t: L('📍 Guardar onde estou', '📍 Save where I am'), cls: 'go', go: saveSpotHere }].concat(allPlaces().slice(0, 30).map(p => ({
      t: (p.my ? '★ ' : '') + esc(p.n), s: dist(p.d) + (p.s ? ' · ' + esc(T(p.s.type)) : ''), go: () => show(spotView(p))
    }))));
  }
  function spotView(p) {
    return list(() => p.n, () => [
      { t: L('🎣 Pescar aqui', '🎣 Fish here'), cls: 'go', go: () => { setLocW({ mode: p.my ? 'my' : p.place ? 'place' : 'spot', lat: p.lat, lon: p.lon, name: p.n }); home(); } },
      { t: L('➕ Registar captura aqui', '➕ Log a catch here'), go: () => startCatch(null, p.n) }
    ], () => {
      const s = p.s, C = LIVE.wx && LIVE.wx.current;
      let h = `<div class="sub">${dist(p.d)}${s ? ' · ' + esc(T(s.a)) : ''}</div>`;
      if (s) {
        h += `<div>${s.fish.map(n => `<span class="chip${FISH.some(f => f.n === n && f.m.includes(tp.m)) ? ' r' : ''}">${esc(T(n))}</span>`).join('')}</div><div class="box tide"><div class="lbl" style="margin:0">${L('Melhor maré', 'Best tide')}</div>${esc(T(s.tide))}</div><div class="mut">${esc(T(s.note))}</div>`;
        if (C && FACE[s.n] != null && p.d < 40) { const r = windRel(FACE[s.n], C.wind_direction_10m, C.wind_speed_10m); h += `<div class="box ${r.cls}"><b>${esc(T(r.t))}</b><div class="mut">${esc(T(r.tip))}</div></div>`; }
      } else if (p.note) h += `<div class="mut">${esc(p.note)}</div>`;
      return h;
    });
  }
  async function saveSpotHere() {
    const g = await getGPS(false); if (!g) return;
    const p = ukParts(Date.now()), n = L('Relógio ', 'Watch ') + `${p.d}/${p.m + 1} ${pad(p.hh)}:${pad(p.mm)}`;
    enqueue('p', { id: 'p' + Date.now(), n, notes: L('Guardado no relógio', 'Saved on the watch'), lat: g.lat, lon: g.lon, t: Date.now() });
    toast(L(`Guardado “${n}”. Muda o nome no telemóvel.`, `Saved “${n}”. Rename it on the phone.`)); draw();
  }

  // ---------- log a catch: every step chosen with the bezel, confirmed with a tap ----------
  function condAt(t) {
    const p = ukParts(t), D = computeDay(p.y, p.m, p.d), out = { tide: tideState(D.tides, t), moon: phaseName(moonPhase(t).phase) };
    const i = wxHourIdx(t); if (i >= 0) { const H = LIVE.wx.hourly; out.wind = `${Math.round(H.wind_speed_10m[i])} mph ${compass(H.wind_direction_10m[i])}`; }
    const w = D.wins.find(x => t >= x.s && t < x.e); if (w) out.win = w.label;
    const tdp = D.tides.length ? tidePhase(D.tides, t) : null; if (tdp) out.phase = tdp.label;
    out.light = lightAt(D, t);
    return out;
  }
  function startCatch(sp, spot) {
    const c = { t: Date.now(), sp: sp || '', len: null, wt: null, bait: '', spot: spot || '', kept: 'Released' };
    if (!c.spot) { const n = allPlaces().filter(p => !p.place)[0]; if (n && n.d < 3) c.spot = n.n; }
    if (sp) stepLen(c); else stepSpecies(c);
  }
  function stepSpecies(c) {
    show(list(() => L('Que peixe?', 'Which fish?'), () => inSeasonSort(FISH).map(f => ({ t: esc(T(f.n)), s: f.m.includes(tp.m) ? '' : L('fora de época', 'out of season'), go: () => { c.sp = f.n; stepLen(c); } }))
      .concat([{ t: L('Outro', 'Other'), go: () => { c.sp = 'Other'; stepLen(c); } }])));
  }
  function stepLen(c) {
    const f = FISH.find(x => x.n === c.sp), min = legalCm(f);
    show(numberPick({ title: L('Comprimento', 'Length'), value: min || 30, step: 1, min: 1, max: 250, unit: 'cm', skip: L('Não medi', 'Not measured'),
      hint: f ? (f.ret ? L('Tem de voltar à água.', 'Must be returned.') : f.min ? L('Mínimo legal ', 'Legal minimum ') + T(f.min) : L('Sem mínimo legal', 'No legal minimum')) : '',
      done: v => { c.len = v; stepWt(c); } }));
    top().skipIt = () => { c.len = null; stepWt(c); };
  }
  function stepWt(c) {
    show(numberPick({ title: L('Peso', 'Weight'), value: 1, step: 0.1, min: 0.1, max: 60, unit: 'kg', fmt: v => v.toFixed(1), skip: L('Não pesei', 'Not weighed'), done: v => { c.wt = v; stepKept(c); } }));
    top().skipIt = () => { c.wt = null; stepKept(c); };
  }
  function stepKept(c) {
    const f = FISH.find(x => x.n === c.sp);
    if (f && f.ret) { c.kept = 'Released'; return stepBait(c); }
    const min = legalCm(f), small = min && c.len && c.len < min;
    show(list(() => L('Ficou ou voltou?', 'Kept or released?'), () => [
      { t: L('Devolvido', 'Released'), go: () => { c.kept = 'Released'; stepBait(c); } },
      { t: L('Guardado', 'Kept'), s: small ? L(`Abaixo do mínimo (${T(f.min)})!`, `Under the minimum (${f.min})!`) : '', cls: small ? 'prime' : '', go: () => { c.kept = 'Kept'; stepBait(c); } }
    ]));
  }
  function stepBait(c) {
    const f = FISH.find(x => x.n === c.sp), baits = f ? f.bait : Array.from(new Set(FISH.flatMap(x => x.bait))).slice(0, 20);
    show(list(() => L('Isco', 'Bait'), () => baits.map(b => ({ t: esc(T(b)), go: () => { c.bait = b; stepSpot(c); } })).concat([{ t: L('Outro / nenhum', 'Other / none'), go: () => { c.bait = ''; stepSpot(c); } }])));
  }
  function stepSpot(c) {
    const near = allPlaces().filter(p => !p.place).slice(0, 8);
    show(list(() => L('Onde?', 'Where?'), () => (c.spot ? [{ t: '✓ ' + esc(c.spot), go: () => stepSave(c) }] : []).concat(near.filter(p => p.n !== c.spot).map(p => ({ t: (p.my ? '★ ' : '') + esc(p.n), s: dist(p.d), go: () => { c.spot = p.n; stepSave(c); } })), [{ t: L('Nenhum', 'None'), go: () => { c.spot = ''; stepSave(c); } }])));
  }
  function stepSave(c) {
    const f = FISH.find(x => x.n === c.sp), min = legalCm(f);
    show(list(() => L('Guardar?', 'Save?'), () => [{ t: L('💾 Guardar captura', '💾 Save catch'), cls: 'go', go: () => {
      const o = { id: 'c' + Date.now(), t: c.t, sp: c.sp, len: c.len, wt: c.wt, bait: c.bait, spot: c.spot, kept: c.kept, notes: '', photo: null, cond: condAt(c.t), from: 'watch' };
      enqueue('c', o);
      let msg = L('Captura guardada.', 'Catch saved.');
      if (f && f.ret) msg = L(`${T(c.sp)} tem de voltar à água. Registado como devolvido.`, `${c.sp} must be returned. Logged as released.`);
      else if (min && c.len && c.len < min && c.kept === 'Kept') msg = L(`Cuidado: ${c.len} cm está abaixo do mínimo (${T(f.min)}). Tem de voltar à água.`, `Careful: ${c.len} cm is under the ${f.min} minimum. It has to go back.`);
      if (!SYNC_RE.test(CODE)) msg += L(' Põe o código do telemóvel nas Definições para ir para o registo.', ' Add the phone code in Settings to send it to the log.');
      home(); toast(msg);
    } }], () => `<div class="box"><b>${esc(T(c.sp))}</b><div>${[c.len ? c.len + ' cm' : '', c.wt ? c.wt.toFixed(1) + ' kg' : '', T(c.kept === 'Kept' ? 'Kept' : 'Released')].filter(Boolean).map(esc).join(' · ')}</div><div class="mut">${esc([T(c.bait), c.spot, fmt(c.t)].filter(Boolean).join(' · '))}</div><div class="mut">${esc(T(condAt(c.t).tide))} · ${esc(T(condAt(c.t).moon))}</div></div>`));
  }

  function catchesView() {
    return list(() => L('As minhas capturas', 'My catches'), () => [{ t: L('🔄 Sincronizar', '🔄 Sync'), go: () => { syncWatch(); toast(L('A sincronizar…', 'Syncing…')); } }], () => {
      const all = watchCatches().concat(CLOUD.catches || []).filter((c, i, a) => a.findIndex(o => o.id === c.id) === i).sort((a, b) => b.t - a.t);
      const pend = QUEUE.length;
      const head = `<div class="sub">${SYNC_RE.test(CODE) ? (CLOUD.total ? CLOUD.total + L(' no registo', ' in the log') : '') + (pend ? ` · ${pend} ${L('por enviar', 'to send')}` : '') : L('Não ligado ao telemóvel (Definições)', 'Not linked to the phone (Settings)')}</div>`;
      return head + (all.length ? all.slice(0, 15).map(c => { const cd = c.cond || {}; return `<div class="box${c.kept === 'Kept' ? ' prime' : ''}"><b>${esc(T(c.sp))}</b>${c.len ? ' · ' + c.len + ' cm' : ''}${c.wt ? ' · ' + c.wt + ' kg' : ''}<div class="mut">${esc(dateLong(c.t))} ${fmt(c.t)}${c.spot ? ' · ' + esc(c.spot) : ''}</div><div class="mut">${esc([T(cd.tide), T(cd.moon), T(c.bait)].filter(Boolean).join(' · '))}</div></div>`; }).join('') : `<div class="mut c">${L('Ainda sem capturas.', 'No catches yet.')}</div>`) + `<div class="mut c">${L('Fotos e apagar: no telemóvel.', 'Photos and deleting: on the phone.')}</div>`;
    });
  }

  // ---------- settings ----------
  function settingsView() {
    return list(() => L('Definições', 'Settings'), () => [
      { t: L('📍 Local', '📍 Location'), s: esc(LOC.name), go: () => show(locView()) },
      { t: L('🔗 Ligar ao telemóvel', '🔗 Link to the phone'), s: SYNC_RE.test(CODE) ? esc(CODE) : L('sem código', 'no code'), go: () => codeEntry() },
      { t: L('🔔 Notificações', '🔔 Notifications'), s: notifOn() ? L('ligadas', 'on') : L('desligadas', 'off'), go: () => { lsSet('sh-w-notif', notifOn() ? '0' : '1'); scheduleAlerts(); draw(); toast(notifOn() ? L('Vou avisar das melhores horas e das luas cheia e nova.', 'I\'ll alert you to the best times and full and new moons.') : L('Notificações desligadas.', 'Notifications off.')); } },
      { t: L('🌐 Idioma: Português', '🌐 Language: English'), go: () => { LANG = LANG === 'pt' ? 'en' : 'pt'; lsSet('sh-lang', LANG); draw(); scheduleAlerts(); } },
      { t: L('🔄 Atualizar tudo', '🔄 Refresh everything'), go: () => { loadLive(true); syncWatch(); toast(L('A atualizar…', 'Updating…')); } }
    ], () => `<div class="sub">Santos Tides ⌚ ${VERSION}</div>`);
  }
  function locView() {
    return list(() => L('Local', 'Location'), () => [
      { t: L('📍 Usar o GPS do relógio', '📍 Use the watch GPS'), cls: 'go', go: () => { useGPS(false); home(); } },
      { t: L('🏠 Southampton (casa)', '🏠 Southampton (home)'), go: () => { setLocW(HOME); home(); } }
    ].concat(allPlaces().slice(0, 40).map(p => ({ t: (p.my ? '★ ' : '') + esc(p.n), s: dist(p.d), go: () => { setLocW({ mode: p.my ? 'my' : p.place ? 'place' : 'spot', lat: p.lat, lon: p.lon, name: p.n }); home(); } }))));
  }
  // the backup code, one letter at a time: turn the bezel to change the letter, tap "Next"
  function codeEntry() {
    const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const cur = SYNC_RE.test(CODE) ? CODE.replace(/^SH-|-/g, '').split('') : 'AAAAAAAAAAAA'.split('');
    let pos = 0;
    const shown = () => 'SH-' + cur.map((ch, i) => (i === pos ? `<i>${ch}</i>` : ch) + (i === 3 || i === 7 ? '-' : '')).join('');
    const v = {
      kind: 'pick',
      html: () => `<div class="pick"><h1>${L('Código do telemóvel', 'Phone code')}</h1><div class="code" id="cd">${shown()}</div><div class="v" id="ch" style="font-size:56px">${cur[pos]}</div><div class="u">${pos + 1} / 12</div><div class="ok" id="pk-ok">${pos < 11 ? L('Seguinte', 'Next') : L('Guardar', 'Save')}</div><div class="skip" id="pk-skip">${L('‹ Letra anterior', '‹ Previous letter')}</div><div class="hint">${L('Está no telemóvel: Registo › Backup online', 'On the phone: Log › Online backup')}</div></div>`,
      turn: d => { cur[pos] = AL[(AL.indexOf(cur[pos]) + d + AL.length) % AL.length]; document.getElementById('ch').textContent = cur[pos]; document.getElementById('cd').innerHTML = shown(); },
      ok: () => {
        if (pos < 11) { pos++; draw(); return; }
        const code = `SH-${cur.slice(0, 4).join('')}-${cur.slice(4, 8).join('')}-${cur.slice(8).join('')}`;
        if (!SYNC_RE.test(code)) { toast(L('Código inválido.', 'That code isn\'t valid.')); return; }
        CODE = code; lsSet('sh-sync', code); CLOUD = { spots: [], catches: [], total: 0, at: 0 }; lsSet('sh-w-cloud', JSON.stringify(CLOUD));
        stack.pop(); draw(); syncWatch(); toast(L('Ligado ao telemóvel. A buscar o registo…', 'Linked to the phone. Getting the log…'));
      },
      skipIt: () => { if (pos > 0) { pos--; draw(); } else back(); }
    };
    show(v);
  }

  // ---------- start ----------
  setGeo(LOC.lat, LOC.lon); applyPack();
  stack.push(rootView()); stack[0].focus = -1; draw(true);
  const forAlert = launchedForAlert();
  if (forAlert) fireDueAlerts(true);
  else {
    if (LOC.mode === 'gps') useGPS(true).then(() => { if (!LIVE.wx || Date.now() - LIVE.wxAt > 20 * MIN) loadLive(); });
    else loadLive();
    syncWatch(); scheduleAlerts();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { draw(); loadLive(false); syncWatch(); } });
  setInterval(() => { if (!document.hidden) draw(); }, 60000);
})();
