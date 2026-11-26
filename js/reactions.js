// Message reactions: 👍 / 👎 on chat messages (every chat, Yoodi's too), saved in public.message_reactions.
// Part of the app's main code. Classic script, same global scope as the other js/ files: see js/README.md.
//
// How it works (25 Nov 2026):
//  - Messages you RECEIVED get a small 👍 👎 row under the bubble. Both show faded until you pick one;
//    then only your pick shows, in full colour. Tap your pick again to take it back.
//  - On the bubble itself: double tap = 👍, press and hold = 👎 (iPhone and desktop; pointer events).
//  - Messages you SENT show the other person's reaction (if any) under the bubble. You can't react to your own.
//  - One reaction per person per message (primary key message_id + user_id). Table + rules:
//    supabase/migrations/20261125_001_message_reactions.sql
//  - The other person sees a new reaction the next time the chat reloads (opening it, or a new message).
// Hooks: chat.js loadChatMessages() and yoodi.js yoodiMsgHtml() put data-mid / data-me on each message row
// and call rxDecorate(el) after drawing. Uses globals sb, me, esc.

const RX_EMOJI={up:'👍',down:'👎'};
const RX_HOLD_MS=500, RX_DOUBLE_MS=320;
let rxMine={};          // message_id → 'up' | 'down' (my reactions in the open chat)
let rxTheirs={};        // message_id → 'up' | 'down' (the other side's reactions on my messages)
let rxPaintToken=0;

(function rxCss(){
  const s=document.createElement('style');
  s.textContent=`
#chat-messages [data-mid]{flex-direction:column}
#chat-messages [data-mid][data-me="0"]{align-items:flex-start}
#chat-messages [data-mid][data-me="1"]{align-items:flex-end}
#chat-messages [data-mid][data-me="0"]>div:first-child{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation;cursor:pointer}
.rx{display:flex;gap:2px;margin-top:3px;min-height:22px}
.rx:empty{display:none}
.rx button{border:none;background:none;padding:1px 5px;font-size:15px;line-height:20px;cursor:pointer;border-radius:10px;opacity:.38;filter:grayscale(1);transition:opacity .15s,transform .15s}
.rx button:hover{opacity:.7}
.rx button.on{opacity:1;filter:none;background:var(--surface2)}
.rx span{font-size:14px;line-height:20px;padding:1px 6px;border-radius:10px;background:var(--surface2)}
.rx-pop{animation:rxPop .25s ease}
@keyframes rxPop{0%{transform:scale(.6)}60%{transform:scale(1.25)}100%{transform:scale(1)}}`;
  document.head.appendChild(s);
})();

// Called right after a chat is drawn: adds the placeholder rows now, then fills in saved reactions.
function rxDecorate(el){
  if(!el)return;
  rxBindGestures(el);
  const rows=[...el.querySelectorAll('[data-mid]')];
  rows.forEach(r=>{if(!r.querySelector('.rx'))r.insertAdjacentHTML('beforeend',`<div class="rx" data-rx="${esc(r.dataset.mid)}"></div>`);});
  rxMine={};rxTheirs={};
  rows.forEach(rxPaint);
  rxLoad(rows.map(r=>r.dataset.mid));
}

async function rxLoad(ids){
  if(!sb||!me||!ids.length)return;
  const token=++rxPaintToken;
  const found=[];
  for(let i=0;i<ids.length;i+=100){   // keep the URL short in long chats
    const{data,error}=await sb.from('message_reactions').select('message_id,user_id,reaction').in('message_id',ids.slice(i,i+100));
    if(error){console.warn('reactions',error);return;}
    found.push(...(data||[]));
  }
  if(token!==rxPaintToken)return;     // a newer redraw started meanwhile
  found.forEach(r=>{if(r.user_id===me.id)rxMine[r.message_id]=r.reaction;else rxTheirs[r.message_id]=r.reaction;});
  document.querySelectorAll('#chat-messages [data-mid]').forEach(rxPaint);
}

function rxPaint(row){
  const id=row.dataset.mid,box=row.querySelector('.rx');if(!box)return;
  if(row.dataset.me==='1'){   // my message: show what they picked, nothing to tap
    const t=rxTheirs[id];
    box.innerHTML=t?`<span aria-label="They reacted ${t==='up'?'thumbs up':'thumbs down'}">${RX_EMOJI[t]}</span>`:'';
    return;
  }
  const mine=rxMine[id];
  box.innerHTML=['up','down'].filter(v=>!mine||mine===v).map(v=>
    `<button type="button" data-rxv="${v}" class="${mine===v?'on':''}" aria-pressed="${mine===v}" aria-label="${v==='up'?'Thumbs up':'Thumbs down'}">${RX_EMOJI[v]}</button>`).join('');
}

// Save (or clear, when v is null) my reaction on one message. Optimistic: repaint first, undo on error.
async function rxSet(id,v){
  if(!sb||!me||!id)return;
  const row=document.querySelector(`#chat-messages [data-mid="${CSS.escape(id)}"]`);
  const before=rxMine[id]||null;if(before===v)return;
  if(v)rxMine[id]=v;else delete rxMine[id];
  if(row){rxPaint(row);const b=row.querySelector('.rx button.on');if(b)b.classList.add('rx-pop');}
  const{error}=v
    ?await sb.from('message_reactions').upsert({message_id:id,user_id:me.id,reaction:v,updated_at:new Date().toISOString()},{onConflict:'message_id,user_id'})
    :await sb.from('message_reactions').delete().eq('message_id',id).eq('user_id',me.id);
  if(error){
    console.warn('reaction',error);
    if(before)rxMine[id]=before;else delete rxMine[id];
    if(row)rxPaint(row);
    toast('❌ Could not save your reaction');
  }
}

// Taps on the 👍 👎 buttons, double tap / press-and-hold on received bubbles. Bound once per chat list element.
function rxBindGestures(el){
  if(el._rxBound)return;el._rxBound=true;
  let holdTimer=null,holdFired=false,startX=0,startY=0,lastUpAt=0,lastUpId=null;
  const bubbleOf=t=>{
    if(t.closest('a,button,input,textarea'))return null;
    const b=t.closest('[data-mid][data-me="0"]>div:first-child');
    return b?b.parentElement:null;
  };
  const cancelHold=()=>{clearTimeout(holdTimer);holdTimer=null;};

  el.addEventListener('click',e=>{
    const btn=e.target.closest('.rx button[data-rxv]');if(!btn)return;
    const row=btn.closest('[data-mid]'),v=btn.dataset.rxv;
    rxSet(row.dataset.mid,rxMine[row.dataset.mid]===v?null:v);
  });
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const row=bubbleOf(e.target);if(!row)return;
    holdFired=false;startX=e.clientX;startY=e.clientY;cancelHold();
    holdTimer=setTimeout(()=>{holdTimer=null;holdFired=true;lastUpAt=0;rxSet(row.dataset.mid,'down');},RX_HOLD_MS);
  });
  el.addEventListener('pointermove',e=>{if(holdTimer&&Math.hypot(e.clientX-startX,e.clientY-startY)>10)cancelHold();}); // scrolling, not holding
  el.addEventListener('pointercancel',cancelHold);
  el.addEventListener('pointerup',e=>{
    const wasHold=holdFired;cancelHold();holdFired=false;
    if(wasHold)return;
    const row=bubbleOf(e.target);if(!row)return;
    const id=row.dataset.mid,now=Date.now();
    if(lastUpId===id&&now-lastUpAt<RX_DOUBLE_MS){
      lastUpAt=0;lastUpId=null;
      rxSet(id,rxMine[id]==='up'?null:'up');   // double tap again takes the 👍 back
    }else{lastUpAt=now;lastUpId=id;}
  });
  el.addEventListener('contextmenu',e=>{if(bubbleOf(e.target))e.preventDefault();}); // no long-press menu on the bubble
}
