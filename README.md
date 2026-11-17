# Santos Hooked Tides

Tides, moon, wind and fishing times for the Solent, Dorset, Portugal and Madeira.

- `public/` – the web app. The Cloudflare Worker **santos-hooked-tides** is linked to this repository and publishes it by itself on every change to the `app` branch.
  Link: https://santos-hooked-tides.ronnieandrodrigues.workers.dev
- `worker.js` + `lib/` – live data routes: `/api/tides` (official ADMIRALTY tides, needs the secret `ADMIRALTY_KEY` in Cloudflare) and `/api/warnings` (Met Office / IPMA).
- `android/` – the Android app. GitHub builds the APK by itself (Actions tab).
- `netlify/` + `netlify.toml` – the old Netlify host still works from the same files.

## Install on an Android phone
Open this link on the phone and install the file:
`https://github.com/Rodron85/santos-hooked-tides/releases/latest/download/SantosTides.apk`
