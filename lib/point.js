// Santos Hooked Tides: what's under a tapped point on the map.
// GET /api/point?lat=50.8&lon=-1.3 → { elev, shore_m }
//   elev    – seabed height relative to Lowest Astronomical Tide, metres (negative = underwater at the lowest tide),
//             from the EMODnet Bathymetry DTM served by the European Environment Agency. null = no data / on land.
//   shore_m – metres to the nearest OpenStreetMap coastline (the mean high water line), searched within 3 km.
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=604800', 'netlify-cdn-cache-control': 'public, s-maxage=604800' } });
const UA = { 'user-agent': 'SantosHookedTides/1.0 (fishing app)' };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function depth(lat, lon) {
  const g = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  const u = `https://water.discomap.eea.europa.eu/arcgis/rest/services/Marine/Bathymetry/ImageServer/getSamples?geometry=${g}&geometryType=esriGeometryPoint&returnFirstValueOnly=true&interpolation=RSP_BilinearInterpolation&f=json`;
  const r = await fetch(u, { headers: UA, cf: { cacheTtl: 604800, cacheEverything: true } });
  if (!r.ok) throw new Error('bathymetry HTTP ' + r.status);
  const d = await r.json(), v = d && d.samples && d.samples[0] ? parseFloat(d.samples[0].value) : NaN;
  return isFinite(v) && Math.abs(v) < 12000 ? Math.round(v * 10) / 10 : null;
}

async function shore(lat, lon) {
  const q = `[out:json][timeout:20];way(around:3000,${lat},${lon})[natural=coastline];out geom;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
  if (!r.ok) throw new Error('coastline HTTP ' + r.status);
  const d = await r.json();
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;   // metres per degree here
  let best = Infinity;
  (d.elements || []).forEach(w => {
    const g = w.geometry || [];
    for (let i = 0; i < g.length - 1; i++) {
      const ax = (g[i].lon - lon) * kx, ay = (g[i].lat - lat) * ky, bx = (g[i + 1].lon - lon) * kx, by = (g[i + 1].lat - lat) * ky;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      const px = ax + t * dx, py = ay + t * dy;
      best = Math.min(best, Math.hypot(px, py));
    }
  });
  return isFinite(best) ? Math.round(best) : null;
}

export default async function point(req) {
  const sp = new URL(req.url).searchParams, lat = +sp.get('lat'), lon = +sp.get('lon');
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'lat & lon needed' }, 400);
  const la = Math.round(lat * 1e4) / 1e4, lo = Math.round(lon * 1e4) / 1e4;
  const [e, s] = await Promise.allSettled([withTimeout(depth(la, lo), 9000), withTimeout(shore(la, lo), 12000)]);
  return json({ lat: la, lon: lo, elev: e.status === 'fulfilled' ? e.value : null, shore_m: s.status === 'fulfilled' ? s.value : null,
    errors: [e, s].filter(x => x.status === 'rejected').map(x => String(x.reason && x.reason.message || x.reason)) });
}
