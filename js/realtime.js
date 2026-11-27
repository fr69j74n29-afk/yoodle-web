// Unread badge, polling and realtime messages.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

let realtimeChannel=null;

// ── UNREAD BADGE — single source of truth from DB ──
let _msgUnread=false; // last known unread-messages state; the dot also shows for unread notifications
function _setMessageBadge(hasUnread){
  _msgUnread=!!hasUnread;
  hasUnread=_msgUnread||_notifs.some(x=>!x.read_at);
  const btn=document.getElementById('ni-messages');if(!btn)return;
  const existing=btn.querySelector('.msg-badge');
  if(hasUnread&&!existing){
    const badge=document.createElement('div');badge.className='msg-badge';
    badge.style.cssText='position:absolute;top:4px;right:10px;width:8px;height:8px;border-radius:50%;background:var(--pink);';
    btn.style.position='relative';btn.appendChild(badge);
  } else if(!hasUnread&&existing){
    existing.remove();
  }
}
// Always query DB — realtime and poller both call this
async function refreshUnreadCount(){
  if(!sb||!me)return;
  const pid=myProfileId||me.id;
  const{data}=await sb.rpc('get_conversations',{user_id:pid});
  const hasAny=(data||[]).some(c=>c.has_unread);
  _setMessageBadge(hasAny);
  if(data&&tabConvSig(data)!==tabCache.messages.sig)tabDirty('messages'); // Messages list is out of date: reload on the next visit
}
function clearMessageBadge(){_setMessageBadge(false);}

let _unreadPollInterval=null,_lastUnreadPoll=0;
// Poll every 60s while the tab is visible; every 5 min while hidden (cuts API/log volume from background tabs).
// Returning to the tab triggers an immediate catch-up via _onVisibility → _catchUpMessages().
function _unreadPollTick(){
  const hidden=document.visibilityState!=='visible';
  if(hidden&&Date.now()-_lastUnreadPoll<5*60*1000)return;
  _lastUnreadPoll=Date.now();
  refreshUnreadCount();
}
function startUnreadPoller(){
  if(_unreadPollInterval)clearInterval(_unreadPollInterval);
  _lastUnreadPoll=Date.now();
  _unreadPollInterval=setInterval(_unreadPollTick,60000);
  // re-check whenever the tab comes back into focus
  document.removeEventListener('visibilitychange',_onVisibility);
  document.addEventListener('visibilitychange',_onVisibility);
  window.removeEventListener('online',_onOnline);
  window.addEventListener('online',_onOnline);
}
function _onVisibility(){
  if(document.visibilityState!=='visible'){_hiddenAt=Date.now();return;}
  if(document.visibilityState==='visible'){
    const _away=_hiddenAt?Date.now()-_hiddenAt:0;_hiddenAt=0;
    // Back after 10+ min away: re-check suspension/terms. Jobs/helpers already refresh on tab return.
    if(me&&sb&&_away>10*60*1000)checkAccountGates();
    // Away >30s (iOS may leave a dead socket looking "joined") or not joined → reconnect
    if(me&&sb&&(_away>30000||realtimeChannel?.state!=='joined'))subscribeToMessages();
    _catchUpMessages(); // includes refreshUnreadCount()
    logActive();
    if(me&&sb&&Date.now()-_viewStatsAt>15*60*1000)loadViewStats();
    // Restore GPS cache if in-memory was lost (e.g. post-form reset)
    if(!gpsLat||!gpsLng){
      const _c=_restoreCachedGps();
      if(_c){gpsLat=_c.lat;gpsLng=_c.lng;locationSource='gps';}
    }
    if(map){
      const _mapActive=document.getElementById('app-map')?.classList.contains('active');
      if(_mapActive){
        // Snapshot position before invalidateSize to prevent drift
        const _c0=map.getCenter(), _lat=userLat??_c0.lat, _lng=userLng??_c0.lng, _z=map.getZoom();
        if(gpsLat&&gpsLng)updateGpsDot();
        try{map.triggerRepaint();}catch(e){} // iOS: redraw after backgrounding
        setTimeout(()=>{_mapResize();_mapSetView(_lat,_lng,_z);updateCircleOverlay();},150);
        setTimeout(()=>{_mapResize();_mapSetView(_lat,_lng,_z);updateCircleOverlay();if(me)loadJobs();},600);
      }
      // If map tab is hidden, nav() will re-anchor when user switches to it
    }
  }
}

function subscribeToMessages(){
  if(!sb||!me)return;
  if(realtimeChannel)sb.removeChannel(realtimeChannel);
  const ch=realtimeChannel=sb.channel('messages-notify').on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{
    const msg=payload.new;const pid=myProfileId||me.id;
    if(msg.receiver_id===pid&&msg.sender_id!==pid){
      playNotificationSound();
      const chatOpen=activeChatConvId&&activeChatConvId===msg.conversation_id;
      if(chatOpen){
        sb.rpc('mark_conversation_read',{p_conversation_id:activeChatConvId,p_user_id:pid})
          .then(()=>refreshUnreadCount());
        loadChatMessages(true);
      } else {
        tabDirty('messages'); // a new message: the next Messages visit reloads (js/core-state.js)
        refreshUnreadCount();
        const msgView=document.getElementById('app-messages');
        if(msgView?.classList.contains('active'))loadMessages();
      }
    }
  }).subscribe(status=>{
    if(ch!==realtimeChannel)return; // old channel closing after a resubscribe — ignore
    if(status==='SUBSCRIBED'){_rtRetry=0;return;}
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')_scheduleRtResubscribe();
  });
}
// Realtime keep-alive: the socket dies when the phone sleeps / tab is backgrounded.
// Reconnect with backoff, and on return pull anything missed while away.
let _rtRetry=0,_rtTimer=null,_hiddenAt=0;
function _scheduleRtResubscribe(){
  if(_rtTimer||!sb||!me)return;
  const d=Math.min(30000,2000*Math.pow(2,_rtRetry++));
  _rtTimer=setTimeout(()=>{_rtTimer=null;if(document.visibilityState==='visible'&&me&&sb)subscribeToMessages();},d);
}
function _catchUpMessages(){
  if(!sb||!me)return;
  refreshUnreadCount();
  if(activeChatConvId){
    const pid=myProfileId||me.id;
    loadChatMessages(true);
    sb.rpc('mark_conversation_read',{p_conversation_id:activeChatConvId,p_user_id:pid}).then(()=>refreshUnreadCount(),()=>{});
  }
  if(document.getElementById('app-messages')?.classList.contains('active'))loadMessages();
}
function _onOnline(){if(me&&sb){subscribeToMessages();_catchUpMessages();}}
