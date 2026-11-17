// Netlify wrapper: the code lives in lib/tides.js (shared with the Cloudflare Worker)
import tides from '../../lib/tides.js';
export default req => tides(req, process.env.ADMIRALTY_KEY);
