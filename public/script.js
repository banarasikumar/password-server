
/* Front-end: communicates with server endpoints */
const pwdEl = document.getElementById('password');
const btn = document.getElementById('unlockBtn');
const statusEl = document.getElementById('status');
const entriesEl = document.getElementById('entries');
const countdownEl = document.getElementById('countdown');
const attemptsEl = document.getElementById('attempts');
const maxAttemptsEl = document.getElementById('maxAttempts');

function pad(n){ return String(n).padStart(2,'0'); }
function showToast(msg){ let t=document.getElementById('_toast'); if(!t){ t=document.createElement('div'); t.id='_toast'; t.style.position='fixed'; t.style.right='20px'; t.style.bottom='20px'; t.style.background='#0f1724'; t.style.color='white'; t.style.padding='10px 14px'; t.style.borderRadius='10px'; document.body.appendChild(t);} t.textContent=msg; t.style.opacity='1'; setTimeout(()=>t.style.opacity='0',1800); }

async function fetchStatus(){
  try{
    const r = await fetch('/status');
    const j = await r.json();
    attemptsEl.textContent = j.attempts || 0;
    maxAttemptsEl.textContent = j.maxUnlocks || 0;
    if(j.timeRemainingMs !== null && j.timeRemainingMs !== undefined){
      const rem = Math.max(0, Math.floor(j.timeRemainingMs/1000));
      const hh = Math.floor(rem/3600), mm = Math.floor((rem%3600)/60), ss = rem%60;
      countdownEl.textContent = pad(hh)+':'+pad(mm)+':'+pad(ss);
    } else {
      countdownEl.textContent = '--:--:--';
    }
    if(j.cleared){
      statusEl.textContent = 'Data cleared';
      entriesEl.innerHTML = '<div class="muted">[data cleared]</div>';
      pwdEl.disabled = true; btn.disabled = true;
    }
  }catch(e){
    console.warn(e);
  }
}

function renderData(json){
  entriesEl.innerHTML = '';
  let arr = [];
  if(Array.isArray(json)) arr = json;
  else if(typeof json === 'object' && json !== null){
    const arrKey = Object.keys(json).find(k => Array.isArray(json[k]) && json[k].length>0);
    if(arrKey) arr = json[arrKey]; else arr = [json];
  } else {
    entriesEl.innerHTML = '<div class="muted">Decrypted content is not an object/array</div>';
    return;
  }

  arr.forEach(entry=>{
    const card = document.createElement('div'); card.className='card';
    const title = document.createElement('div'); title.className='card-title';
    title.textContent = entry.label || entry.title || entry.name || entry.service || 'Untitled';
    card.appendChild(title);

    const keys = Object.keys(entry).filter(k => !['label','title','name','service'].includes(k));
    if(keys.length===0){
      const m = document.createElement('div'); m.className='muted'; m.textContent = 'No fields';
      card.appendChild(m);
    } else {
      keys.forEach(k=>{
        const v = entry[k];
        const field = document.createElement('div'); field.className='field';
        const keyEl = document.createElement('div'); keyEl.className='field-key'; keyEl.textContent = k;
        const valEl = document.createElement('div'); valEl.className='field-val';

        let real = (v===null||v===undefined)? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
        const isSensitive = /pass|pwd|password|pin|cvv|mpin|secret|token|key/i.test(k);
        if(isSensitive){
          valEl.textContent = '••••••••';
          valEl.dataset.real = real;
          valEl.dataset.shown = '0';
        } else {
          valEl.textContent = real;
        }

        const controls = document.createElement('div'); controls.className='field-controls';
        if(isSensitive){
          const eye = document.createElement('button'); eye.className='icon-btn'; eye.title='Show/Hide';
          eye.innerText = '👁️';
          eye.addEventListener('click', ()=>{
            if(valEl.dataset.shown === '1'){ valEl.textContent = '••••••••'; valEl.dataset.shown='0'; eye.innerText='👁️'; }
            else{ valEl.textContent = valEl.dataset.real; valEl.dataset.shown='1'; eye.innerText='🙈'; }
          });
          controls.appendChild(eye);
        }
        const copyBtn = document.createElement('button'); copyBtn.className='icon-btn'; copyBtn.title='Copy';
        copyBtn.innerText = '📋';
        copyBtn.addEventListener('click', async ()=>{
          try{ await navigator.clipboard.writeText(valEl.dataset.real || valEl.textContent || ''); showToast('Copied'); }
          catch(e){ showToast('Copy failed'); }
        });
        controls.appendChild(copyBtn);

        field.appendChild(keyEl);
        field.appendChild(valEl);
        field.appendChild(controls);
        card.appendChild(field);
      });
    }

    entriesEl.appendChild(card);
  });
}

btn.addEventListener('click', async ()=>{
  const pwd = pwdEl.value || '';
  if(!pwd){ statusEl.textContent = 'Enter password'; return; }
  statusEl.textContent = 'Sending...';
  try{
    const r = await fetch('/unlock', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ password: pwd }) });
    const j = await r.json();
    if(r.status === 200 && j.ok){
      statusEl.textContent = 'Decryption succeeded';
      renderData(j.data);
      attemptsEl.textContent = j.attempts || attemptsEl.textContent;
      if(j.clearedAfterResponse){
        showToast('Max attempts reached — data deleted');
        setTimeout(()=>fetchStatus(), 800);
      }
    } else {
      statusEl.textContent = j.error || 'Failed';
      attemptsEl.textContent = j.attempts || attemptsEl.textContent;
      if(r.status === 410 || j.error === 'data cleared' || j.error === 'data expired'){
        entriesEl.innerHTML = '<div class="muted">[data cleared]</div>';
        pwdEl.disabled = true; btn.disabled = true;
      }
    }
  }catch(e){
    console.error(e);
    statusEl.textContent = 'Network error';
  }
});

fetchStatus();
setInterval(fetchStatus, 1000);
