
Secure Viewer — Server-Backed (light-mode UI)
============================================

What this package contains:
- server.js        : Express server handling decryption & global attempt enforcement
- package.json     : npm metadata
- public/          : front-end assets (index.html, styles.css, script.js)
- data/embedded.json: the encrypted blob (moved from your original HTML)
- data/state.json   : mutable state (attempts, firstUnlock, cleared)

How it works:
- The encrypted combined blob (salt||iv||ciphertext+tag) is stored in data/embedded.json.
- The server exposes:
  - POST /unlock  { password }  -> attempts to decrypt server-side and returns JSON on success
  - GET  /status  -> returns attempts, maxUnlocks, time remaining, cleared flag
- Global attempts are counted in data/state.json (applies across IPs).
- When attempts reach the configured maxUnlocks, the server will delete the embedded JSON (clearing the data).
- The server also clears data when 24 hours (activeWindowMs) elapse since the first successful unlock.

Important security notes:
- Use HTTPS in production (Render provides HTTPS by default). Do not expose this over plain HTTP.
- The server receives client passwords to attempt decryption; that is necessary to keep the blob server-side.
- Consider additional protections:
  - Rate-limit by IP (express-rate-limit) to avoid brute-force distributed attacks.
  - Optional CAPTCHA after N failed attempts per-IP.
  - Store data in a secure store (S3 with lifecycle rules, encrypted at rest).
  - Use environment variables for configuration instead of editing files directly.

Deploying:
1. npm install
2. npm start
3. Deploy to Render / Heroku / any Node hosting. Ensure PORT env var is set by host.

File locations in the zip:
- server.js
- package.json
- public/index.html
- public/styles.css
- public/script.js
- data/embedded.json
- data/state.json
