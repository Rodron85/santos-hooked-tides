// Santos Hooked Tides on Cloudflare: the app files come from ./public; this script only answers
// the live-data routes (official tides, weather warnings) and the Android app link.
import tides from './lib/tides.js';
import warnings from './lib/warnings.js';

const ASSETLINKS = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'uk.santoshooked.tides', sha256_cert_fingerprints: ['D2:AB:56:08:26:95:5F:5E:92:5F:6D:5C:FB:B2:61:CB:BA:8A:3F:D8:F5:38:6E:38:8B:74:B9:E4:44:43:55:61'] }
}];

export default {
  async fetch(request, env) {
    const url = new URL(request.url), p = url.pathname;
    if (p === '/api/tides' || p === '/.netlify/functions/tides') return tides(request, env.ADMIRALTY_KEY);
    if (p === '/api/warnings' || p === '/.netlify/functions/warnings') return warnings(request);
    if (p === '/.well-known/assetlinks.json') return new Response(JSON.stringify(ASSETLINKS), { headers: { 'content-type': 'application/json' } });
    return env.ASSETS.fetch(request);
  }
};
