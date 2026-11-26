// Contact a helper / pro modal.
// Part of the app's main code (split out of index.html, 25 Nov 2026). Classic script, same global scope as the
// other js/ files: see js/README.md for the load order and how to add code.

function isHelperContact(task){
  return task?.type === 'help_offer';
}

let contactHelperId=null;
let contactHelperName='';
let contactIsPro=false; // contacting a Yoodle Pro → anchor the request at the pro listing

function openContactModal(helperId, helperName, isPro){
  if(!sb||!me)return toast('Sign in to contact helpers');
  if(helperId===me.id||helperId===myProfileId)return toast("That's you!");
  contactIsPro=!!isPro;
  contactHelperId=helperId;
  contactHelperName=helperName;
  document.getElementById('contact-helper-name').textContent=helperName;
  document.getElementById('contact-msg').value='';
  openOv('contact-modal');
  closeOv('op-modal');
}

async function submitContactHelper(){
  if(!sb||!me||!contactHelperId)return;
  const msg=document.getElementById('contact-msg').value.trim();
  if(!msg)return toast('Please write a message');
  const btn=document.querySelector('#contact-modal .btn-primary');
  btn.disabled=true;btn.textContent='Sending…';
  const pid=myProfileId||me.id;

  // get my name + helper's location for the task anchor
  const [{data:myProf},{data:helperProf0}]=await Promise.all([
    getMyName().then(name=>({data:name?{name}:null})),
    contactIsPro
      ?sb.rpc('get_public_pros',{p_profile:contactHelperId}).maybeSingle()
      :sb.from('profiles').select('last_lat,last_lng,helper_address').eq('id',contactHelperId).single()
  ]);
  const helperProf=contactIsPro&&helperProf0?{last_lat:helperProf0.lat,last_lng:helperProf0.lng,helper_address:helperProf0.address}:helperProf0;
  const myName=myProf?.name||'Someone';

  // create task anchor: type=help_offer, status=claimed, poster=me, doer=helper
  const{data:task,error:taskErr}=await sb.from('tasks').insert({
    poster_id:pid,
    doer_id:contactHelperId,
    title:(contactIsPro?'Job request to ':'Help request to ')+contactHelperName,
    description:msg,
    price:0,
    category:'Other',
    type:'help_offer',
    status:'claimed',
    lat:helperProf?.last_lat||userLat||0,
    lng:helperProf?.last_lng||userLng||0,
    address:helperProf?.helper_address||'',
    expires_at:new Date(Date.now()+90*24*60*60*1000).toISOString()
  }).select('id').single();

  if(taskErr){btn.disabled=false;btn.textContent='Send Message';return toast('❌ '+taskErr.message);}

  // create conversation: poster=me, applicant=helper
  const{data:convId,error:convErr}=await sb.rpc('create_conversation',{
    p_task_id:task.id, p_poster_id:pid, p_applicant_id:contactHelperId
  });
  if(convErr)console.warn('Conv error:',convErr.message);

  // send first message
  await sb.from('messages').insert({
    conversation_id:convId,
    task_id:task.id,
    sender_id:pid,
    receiver_id:contactHelperId,
    body:msg
  });

  closeOv('contact-modal');
  btn.disabled=false;btn.textContent='Send Message';
  toast('✅ Message sent to '+contactHelperName+'!');
  loadMessages();loadMyJobs();
}
