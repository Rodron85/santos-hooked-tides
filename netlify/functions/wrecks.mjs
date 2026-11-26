// Netlify wrapper: the code lives in lib/wrecks.js (shared with the Cloudflare Worker)
import wrecks from '../../lib/wrecks.js';
export default req => wrecks(req);
