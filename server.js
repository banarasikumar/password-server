/**
 * Simple Express server to host encrypted blob server-side and enforce global attempt limits.
 * - POST /unlock  { password }
 * - GET  /status  -> attempts, maxUnlocks, timeRemainingMs, cleared
 * - GET  /         serves front-end
 *
 * IMPORTANT:
 * - Use HTTPS in production (Render supports it). Never run this over plain HTTP in production.
 * - This is intended to be deployed (e.g., Render, Heroku). See README for deployment hints.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const EMBED_PATH = path.join(DATA_DIR, 'embedded.json');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

function loadJSON(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function saveJSON(p,obj){ fs.writeFileSync(p, JSON.stringify(obj,null,2),'utf8'); }

function clearEmbedded(reason){
  try{
    let st = loadJSON(STATE_PATH);
    st.cleared = true;
    saveJSON(STATE_PATH, st);
    // delete embedded content file
    if(fs.existsSync(EMBED_PATH)) fs.unlinkSync(EMBED_PATH);
    console.log('Embedded cleared:', reason);
  }catch(e){ console.warn('clearEmbedded error', e); }
}

// split combinedB64 into salt(16)|iv(12)|ciphertextWithTag
function splitCombinedB64(combinedB64){
  const buf = Buffer.from(combinedB64, 'base64');
  if(buf.length <= 28) return null;
  const salt = buf.slice(0,16);
  const iv = buf.slice(16,28);
  const ctWithTag = buf.slice(28);
  if(ctWithTag.length < 16) return null;
  const tag = ctWithTag.slice(ctWithTag.length - 16);
  const ct = ctWithTag.slice(0, ctWithTag.length - 16);
  return { salt, iv, ct, tag };
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

app.get('/status', (req,res)=>{
  const st = loadJSON(STATE_PATH);
  let emb = null;
  if(fs.existsSync(EMBED_PATH)) emb = loadJSON(EMBED_PATH);
  const max = emb? emb.maxUnlocks : 0;
  const first = st.firstUnlock ? Number(st.firstUnlock) : null;
  const timeRemainingMs = first ? Math.max(0, (first + (emb? emb.activeWindowMs : 0)) - Date.now()) : null;
  res.json({
    attempts: st.attempts,
    maxUnlocks: max,
    timeRemainingMs,
    cleared: st.cleared || !emb
  });
});

app.post('/unlock', async (req,res)=>{
  try{
    const password = (req.body && req.body.password) ? String(req.body.password) : '';
    if(!password) return res.status(400).json({ ok:false, error:'password required' });

    // reload state and embedded on each request
    const st = loadJSON(STATE_PATH);
    if(st.cleared) return res.status(410).json({ ok:false, error:'data cleared' });
    if(!fs.existsSync(EMBED_PATH)) { st.cleared = true; saveJSON(STATE_PATH, st); return res.status(410).json({ ok:false, error:'data cleared' }); }

    const emb = loadJSON(EMBED_PATH);
    // check expiry
    if(st.firstUnlock){
      const expiry = Number(st.firstUnlock) + emb.activeWindowMs;
      if(Date.now() > expiry){
        clearEmbedded('expired');
        return res.status(410).json({ ok:false, error:'data expired' });
      }
    }

    // increment attempts (global count)
    st.attempts = (st.attempts || 0) + 1;
    const willClearOnThisAttempt = (st.attempts >= emb.maxUnlocks);
    saveJSON(STATE_PATH, st);

    // attempt decrypt
    const parts = splitCombinedB64(emb.combinedB64);
    if(!parts) {
      if(willClearOnThisAttempt) clearEmbedded('invalid blob');
      return res.status(500).json({ ok:false, error:'invalid blob' });
    }

    // derive key pbkdf2
    const key = crypto.pbkdf2Sync(password, parts.salt, emb.pbkdf2Iterations || 200000, 32, 'sha256');

    // decrypt aes-256-gcm
    let plaintext = null;
    try{
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, parts.iv);
      decipher.setAuthTag(parts.tag);
      const dec = Buffer.concat([decipher.update(parts.ct), decipher.final()]);
      plaintext = dec.toString('utf8');
    }catch(e){
      // decryption failed
      if(willClearOnThisAttempt) clearEmbedded('max attempts reached');
      return res.status(401).json({ ok:false, error:'decryption failed', attempts: st.attempts, maxUnlocks: emb.maxUnlocks });
    }

    // parse json
    let json = null;
    try{ json = JSON.parse(plaintext); }catch(e){ json = { raw: plaintext }; }

    // mark firstUnlock if not already
    if(!st.firstUnlock){
      st.firstUnlock = Date.now();
      saveJSON(STATE_PATH, st);
    }

    // if attempts reached max, clear after responding (per request)
    if(willClearOnThisAttempt){
      // respond first then clear
      res.json({ ok:true, data: json, attempts: st.attempts, maxUnlocks: emb.maxUnlocks, clearedAfterResponse: true });
      clearEmbedded('max attempts reached');
      return;
    }

    res.json({ ok:true, data: json, attempts: st.attempts, maxUnlocks: emb.maxUnlocks });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, error:'server error' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=>console.log('Server listening on', PORT));