let _readNotifIds=new Set(JSON.parse(localStorage.getItem('mv_read_notifs')||'[]'));
let _notifPanelOpen=false;
// ══════════════════════════════════════════
//  STORAGE
// ══════════════════════════════════════════
//  FIREBASE REST API — no SDK needed
// ══════════════════════════════════════════
const FB_API_KEY = 'AIzaSyAbd6Ox0TosK-rbODbmQJRj_TwhJjgmQ9o';
const FB_PROJECT = 'microvision-ea8c0';
const AUTH_BASE  = 'https://identitytoolkit.googleapis.com/v1/accounts';
const FS_BASE    = 'https://firestore.googleapis.com/v1/projects/'+FB_PROJECT+'/databases/(default)/documents';
const TOKEN_URL  = 'https://securetoken.googleapis.com/v1/token';
let currentUser  = null;

/** Persists the logged-in user's auth object (uid, email, tokens) to localStorage and
 * updates the in-memory currentUser. */
function _saveAuth(u){ localStorage.setItem('mv_auth',JSON.stringify(u)); currentUser=u; }
/** Reads the saved auth object back from localStorage. Returns null if nothing is saved or
 * it's corrupted. */
function _loadAuth(){ try{ const a=localStorage.getItem('mv_auth'); return a?JSON.parse(a):null; }catch(e){ return null; } }
/** Wipes the saved auth object from localStorage and clears currentUser (used on
 * sign-out). */
function _clearAuth(){ localStorage.removeItem('mv_auth'); currentUser=null; }

/** Exchanges the saved refresh token for a fresh Firebase ID token (tokens expire hourly).
 * Falls back to the last known idToken if the network call fails. */
async function _getToken(){
  const a=_loadAuth(); if(!a) return null;
  try{
    const r=await fetch(TOKEN_URL+'?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({grant_type:'refresh_token',refresh_token:a.refreshToken})});
    const d=await r.json();
    if(d.id_token){ a.idToken=d.id_token; a.refreshToken=d.refresh_token; _saveAuth(a); return d.id_token; }
  } catch(e){ console.warn('Token refresh failed',e); }
  return a.idToken;
}

/** Writes one key/value pair up to Firestore (via REST, PATCH) under this user's private
 * document collection. Fire-and-forget — errors are only logged, never block the UI. */
async function _fsWrite(key,val){
  const token=await _getToken(); if(!token||!currentUser) return;
  const url=FS_BASE+'/users/'+currentUser.uid+'/data/'+encodeURIComponent(key)+'?key='+FB_API_KEY;
  fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body:JSON.stringify({fields:{value:{stringValue:JSON.stringify(val)},updatedAt:{integerValue:String(Date.now())}}})
  }).catch(e=>console.warn('Firestore write error',e));
}

/** Deletes one key's document from this user's Firestore collection. Fire-and-forget. */
async function _fsDelete(key){
  const token=await _getToken(); if(!token||!currentUser) return;
  fetch(FS_BASE+'/users/'+currentUser.uid+'/data/'+encodeURIComponent(key)+'?key='+FB_API_KEY,
    {method:'DELETE',headers:{'Authorization':'Bearer '+token}}).catch(()=>{});
}

/** Downloads every stored key/value document for this user from Firestore in one request
 * (used on login to hydrate localStorage). */
async function _fsReadAll(){
  const token=await _getToken(); if(!token||!currentUser) return {};
  try{
    const r=await fetch(FS_BASE+'/users/'+currentUser.uid+'/data?key='+FB_API_KEY+'&pageSize=300',
      {headers:{'Authorization':'Bearer '+token}});
    const d=await r.json();
    const result={};
    (d.documents||[]).forEach(doc=>{
      const k=decodeURIComponent(doc.name.split('/').pop());
      try{ result[k]=JSON.parse(doc.fields?.value?.stringValue||'null'); }catch(e){ result[k]=null; }
    });
    return result;
  } catch(e){ console.warn('Firestore read error',e); return {}; }
}

/** Local-first data layer: reads/writes go to localStorage immediately (instant UI),
 * then are queued up to Firestore in the background via _fsWrite/_fsDelete. */
const DB = {
  get(k,def=null){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch(e){return def;} },
  set(k,v){ localStorage.setItem(k,JSON.stringify(v)); _fsWrite(k,v); },
  del(k){ localStorage.removeItem(k); _fsDelete(k); }
};

/** Pulls all cloud data down and overwrites matching localStorage keys — called right
 * after login so this device has the latest data. */
async function syncFromCloud(uid,statusCb){
  try{
    if(statusCb) statusCb('Downloading your data...');
    const data=await _fsReadAll();
    Object.entries(data).forEach(([k,v])=>{ if(v!==null) localStorage.setItem(k,JSON.stringify(v)); });
    if(statusCb) statusCb('Sync complete');
  } catch(e){ console.error('Sync error',e); }
}

/** Polls Firestore every 30s for changes made on other devices/sessions and merges them
 * into localStorage, then refreshes the dues badge. */
function startRealtimeSync(uid){
  setInterval(async()=>{
    if(!currentUser) return;
    const data=await _fsReadAll();
    Object.entries(data).forEach(([k,v])=>{ if(v!==null) localStorage.setItem(k,JSON.stringify(v)); });
    updateDuesBadge();
  },30000);
}

/** Switches the auth screen from the register form to the sign-in form. */
function fbShowLogin(){ document.getElementById('fbLoginForm').style.display=''; document.getElementById('fbRegisterForm').style.display='none'; document.getElementById('fbLoginSub').textContent='Sign in to your account'; }
/** Switches the auth screen from the sign-in form to the register form. */
function fbShowRegister(){ document.getElementById('fbLoginForm').style.display='none'; document.getElementById('fbRegisterForm').style.display=''; document.getElementById('fbLoginSub').textContent='Create your account'; }

/** Handles the Sign In button: validates the fields, calls Firebase's signInWithPassword
 * REST endpoint, saves the returned tokens, then boots the app. */
async function fbSignIn(){
  const email=document.getElementById('fb_email').value.trim();
  const pass=document.getElementById('fb_pass').value;
  const errEl=document.getElementById('fbError');
  const btn=document.getElementById('fbSignInBtn');
  if(!email||!pass){ errEl.textContent='Please enter email and password.'; return; }
  btn.disabled=true; btn.textContent='Signing in...'; errEl.textContent='';
  try{
    const r=await fetch(AUTH_BASE+':signInWithPassword?key='+FB_API_KEY,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password:pass,returnSecureToken:true})});
    const d=await r.json();
    if(d.error){ errEl.textContent=fbErrorMsg(d.error.message); btn.disabled=false; btn.textContent='Sign In'; return; }
    _saveAuth({uid:d.localId,email:d.email,idToken:d.idToken,refreshToken:d.refreshToken});
    await onUserSignedIn();
  } catch(e){ errEl.textContent='Network error. Check your internet.'; btn.disabled=false; btn.textContent='Sign In'; }
}

/** Handles the Create Account button: validates fields (incl. 6-char minimum password),
 * calls Firebase's signUp REST endpoint, saves tokens, then boots the app. */
async function fbRegister(){
  const name=document.getElementById('fb_name').value.trim();
  const email=document.getElementById('fb_reg_email').value.trim();
  const pass=document.getElementById('fb_reg_pass').value;
  const errEl=document.getElementById('fbRegError');
  const btn=document.getElementById('fbRegisterBtn');
  if(!name||!email||!pass){ errEl.textContent='Please fill all fields.'; return; }
  if(pass.length<6){ errEl.textContent='Password must be at least 6 characters.'; return; }
  btn.disabled=true; btn.textContent='Creating...'; errEl.textContent='';
  try{
    const r=await fetch(AUTH_BASE+':signUp?key='+FB_API_KEY,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password:pass,returnSecureToken:true})});
    const d=await r.json();
    if(d.error){ errEl.textContent=fbErrorMsg(d.error.message); btn.disabled=false; btn.textContent='Create Account'; return; }
    _saveAuth({uid:d.localId,email:d.email,idToken:d.idToken,refreshToken:d.refreshToken});
    await onUserSignedIn();
  } catch(e){ errEl.textContent='Network error. Check your internet.'; btn.disabled=false; btn.textContent='Create Account'; }
}

/** Sends a password-reset email via Firebase's sendOobCode REST endpoint for whatever
 * address is currently in the email field. */
async function fbForgotPassword(){
  const email=document.getElementById('fb_email').value.trim();
  const errEl=document.getElementById('fbError');
  const link=document.querySelector('[onclick="fbForgotPassword()"]');
  if(!email){ errEl.style.color='#dc2626'; errEl.textContent='⚠️ Type your email in the Email field above first.'; return; }
  // Show loading
  errEl.style.color='#6b7280'; errEl.textContent='⏳ Sending reset email...';
  if(link) link.style.pointerEvents='none';
  try{
    const r=await fetch(AUTH_BASE+':sendOobCode?key='+FB_API_KEY,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({requestType:'PASSWORD_RESET',email})
    });
    const d=await r.json();
    if(d.error){
      errEl.style.color='#dc2626';
      errEl.textContent='❌ '+fbErrorMsg(d.error.message);
    } else {
      errEl.style.color='#16a34a';
      errEl.textContent='✅ Reset email sent to '+email+'. Check your inbox & spam folder.';
    }
  } catch(e){
    errEl.style.color='#dc2626';
    errEl.textContent='❌ Network error. Check your internet and try again.';
  }
  if(link) link.style.pointerEvents='';
}

/** Clears local auth state and returns the user to the sign-in screen, resetting the form
 * fields and any error/loading text. */
function fbSignOut(){
  _clearAuth();
  document.getElementById('mainApp').style.display='none';
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('fbLoginScreen').style.display='flex';
  document.getElementById('fb_email').value='';
  document.getElementById('fb_pass').value='';
  document.getElementById('fbError').textContent='';
  document.getElementById('fbSignInBtn').disabled=false;
  document.getElementById('fbSignInBtn').textContent='Sign In';
}

/** Runs right after a successful sign-in (or on page load if a saved session exists):
 * shows the sync overlay, pulls cloud data down, starts the realtime poller, then either
 * shows the PIN screen or boots straight into the app. */
async function onUserSignedIn(){
  document.getElementById('fbLoginScreen').style.display='none';
  document.getElementById('fbSyncOverlay').style.display='flex';
  document.getElementById('fbSyncText').textContent='Syncing your data...';
  await syncFromCloud(currentUser.uid,t=>{ document.getElementById('fbSyncText').textContent=t; });
  startRealtimeSync(currentUser.uid);
  document.getElementById('fbSyncOverlay').style.display='none';
  const s=DB.get('mv_settings',{});
  if(s.pin){ document.getElementById('loginScreen').style.display='flex'; }
  else { bootApp(); }
}

/** Maps a Firebase Auth REST API error code to a friendly, human-readable message. */
function fbErrorMsg(code){
  const msgs={'EMAIL_NOT_FOUND':'No account found with this email.','INVALID_PASSWORD':'Incorrect password.',
    'EMAIL_EXISTS':'Email already registered.','WEAK_PASSWORD':'Password must be at least 6 characters.',
    'TOO_MANY_ATTEMPTS_TRY_LATER':'Too many attempts. Try later.','INVALID_EMAIL':'Invalid email.',
    'INVALID_LOGIN_CREDENTIALS':'Invalid email or password.','USER_DISABLED':'Account disabled.'};
  return msgs[code]||'Error: '+code;
}

// ══════════════════════════════════════════
//  ROLE SYSTEM
// ══════════════════════════════════════════
// ⚠️ Set your admin email here
const ADMIN_EMAIL = '6satyansh9@gmail.com';

/** True if the signed-in user's email matches ADMIN_EMAIL (case-insensitive). */
function isAdmin(){ return currentUser && currentUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase(); }
/** True for any signed-in user who isn't the admin. */
function isStaff(){ return currentUser && !isAdmin(); }

// Pages staff are NOT allowed to access
const STAFF_BLOCKED_PAGES = ['courses','dues','reports','settings','exams','idcards','att-report'];
// Nav items to HIDE for staff
const STAFF_HIDDEN_NAV = ['nav-courses','nav-dues','nav-reports','nav-settings'];

/** Shows/hides admin-only vs staff-only UI elements and sets the role badge, based on
 * isAdmin()/isStaff(). */
function applyRoleUI(){
  // Show logged-in email
  const emailBadge=document.getElementById('userEmailBadge');
  if(emailBadge && currentUser) emailBadge.textContent='📧 '+currentUser.email;

  if(isAdmin()){
    document.querySelectorAll('.admin-only').forEach(el=>el.style.display='');
    document.querySelectorAll('.staff-only').forEach(el=>el.style.display='none');
    const badge=document.getElementById('roleBadge');
    if(badge){ badge.textContent='👑 Admin'; badge.style.background='#fef3c7'; badge.style.color='#92400e'; badge.style.borderColor='#fde68a'; }
  } else {
    document.querySelectorAll('.admin-only').forEach(el=>el.style.display='none');
    document.querySelectorAll('.staff-only').forEach(el=>el.style.display='');
    const badge=document.getElementById('roleBadge');
    if(badge){ badge.textContent='👤 Staff'; badge.style.background='#eff6ff'; badge.style.color='#1d4ed8'; badge.style.borderColor='#bfdbfe'; }
    showToast('👤 Logged in as Staff — limited access','info');
  }
}

/** Gatekeeper for staff-restricted pages
 * (courses/dues/reports/settings/exams/idcards/att-report). Admin always passes; staff get
 * a toast and a denial. */
function checkPageAccess(page){
  if(isAdmin()) return true;
  if(STAFF_BLOCKED_PAGES.includes(page)){
    showToast('⛔ Access restricted. Admin only.','error');
    return false;
  }
  return true;
}

/** App entry point for auth: if a saved session with a refresh token exists, sign the user
 * back in silently; otherwise show the login screen. */
function initFirebase(){
  const auth=_loadAuth();
  if(auth && auth.refreshToken){ currentUser=auth; onUserSignedIn(); }
  else { document.getElementById('fbLoginScreen').style.display='flex'; }
}

//  AUTH STATE — handled inside initFirebase()
// ══════════════════════════════════════════
/** Generates a reasonably-unique id string (timestamp + random suffix) — good enough for
 * local records, not cryptographically secure. */
function uuid(){ return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }
/** Returns today's date formatted as DD/MM/YY (matches the receipt/paperwork date format
 * used throughout the app). */
function today(){
  const d=new Date();
  return (String(d.getDate()).padStart(2,'0'))+'/'+
         (String(d.getMonth()+1).padStart(2,'0'))+'/'+
         String(d.getFullYear()).slice(2);
}
/** Formats a number with Indian-style thousands separators (e.g. 1,00,000) for display;
 * returns '' for zero/falsy so blank fee fields don't show '0'. */
function fmt(v){ return v>0?Number(v).toLocaleString('en-IN'):''; }
/** Same as fmt() but always shows a value, prefixed with the ₹ symbol (used where a real
 * amount, including ₹0, must be visible). */
function fmtFull(v){ return '₹'+Number(v||0).toLocaleString('en-IN'); }

// ══════════════════════════════════════════
//  PIN / LOGIN
// ══════════════════════════════════════════
let pinEntry='';
/** Appends a digit to the in-progress PIN entry (max 4 digits) and refreshes the dot
 * indicators. */
function pinPress(d){ if(pinEntry.length>=4)return; pinEntry+=d; updatePinDots(); }
/** Resets the in-progress PIN entry and clears any 'incorrect PIN' error message. */
function pinClear(){ pinEntry=''; updatePinDots(); document.getElementById('pinError').textContent=''; }
/** Fills in the 4 PIN dots on screen to match how many digits have been entered so far. */
function updatePinDots(){
  for(let i=0;i<4;i++) document.getElementById('d'+i).classList.toggle('filled',i<pinEntry.length);
}
/** Checks the entered PIN against the saved settings PIN. No PIN configured -> just boots
 * the app. Correct -> boots the app. Wrong -> shows an error and resets the entry. */
function pinSubmit(){
  const s=DB.get('mv_settings',{});
  if(!s.pin){ bootApp(); return; }
  if(pinEntry===s.pin){ bootApp(); }
  else{ document.getElementById('pinError').textContent='Incorrect PIN. Try again.'; pinEntry=''; updatePinDots(); }
}
/** Lets the user bypass the PIN screen — only allowed if no PIN has actually been
 * configured in settings. */
function skipPin(){
  const s=DB.get('mv_settings',{});
  if(s.pin){ document.getElementById('pinError').textContent='PIN is set. Please enter it.'; return; }
  bootApp();
}
/** Locks the app: if a PIN is set, drops back to the PIN entry screen; if not, asks the
 * user whether to sign out completely (cloud data is safe either way). */
function lockApp(){
  document.getElementById('mainApp').style.display='none';
  const s=DB.get('mv_settings',{});
  if(s.pin){
    document.getElementById('loginScreen').style.display='flex';
    pinEntry=''; updatePinDots();
  } else {
    // No PIN — ask sign out or cancel
    if(confirm('Sign out of Microvision?\n\nYour data is safely saved to the cloud.')){
      fbSignOut();
    } else {
      document.getElementById('mainApp').style.display='flex';
    }
  }
}
/** Hides the login/PIN screen, reveals the main app shell, and (after the browser paints)
 * runs initApp() and applyRoleUI(). */
function bootApp(){
  const ls=document.getElementById('loginScreen');
  const app=document.getElementById('mainApp');
  ls.style.display='none';
  app.style.display='flex';
  app.style.flexDirection='column';
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      initApp();
      applyRoleUI();
    },0);
  });
}

// ══════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════
let currentPage='dashboard';
// Maps a logical page id to the physical HTML file that contains it.
// If the page-<id> element isn't on the current page, navigate() redirects there.
const PAGE_FILE = {
  dashboard:'index.html', receipt:'receipts.html', history:'receipts.html',
  students:'students.html', courses:'students.html', dues:'students.html',
  reports:'reports.html', settings:'settings.html',
  attendance:'attendance.html', 'att-report':'attendance.html',
  idcards:'id-cards.html', exams:'exams.html'
};
/** Central page router. If the requested page's content isn't part of this HTML file,
 * redirects to the file that has it (via PAGE_FILE), passing the target as a ?tab= param.
 * Otherwise shows the matching .page div, updates the active nav highlighting, and
 * triggers that page's render function. */
function navigate(page){
  if(!checkPageAccess(page)) return;
  if(!document.getElementById('page-'+page)){
    const dest=PAGE_FILE[page]||'index.html';
    if(dest===location.pathname.split('/').pop()){ /* same file, just no matching div */ }
    else { location.href=dest+'?tab='+page; return; }
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.mob-nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  const nv=document.getElementById('nav-'+page);
  if(nv) nv.classList.add('active');
  const mn=document.getElementById('mnav-'+page);
  if(mn) mn.classList.add('active');
  currentPage=page;
  if(window.innerWidth<=768) closeSidebar();
  if(page==='dashboard') renderDashboard();
  else if(page==='history') renderHistory();
  else if(page==='students') renderStudents();
  else if(page==='courses') renderCourses();
  else if(page==='dues') renderDues();
  else if(page==='reports') renderReports();
  else if(page==='settings') loadSettings();
  else if(page==='attendance'){
    const dateEl=document.getElementById('attDate');
    if(dateEl&&!dateEl.value){ const now=new Date(); dateEl.value=now.toISOString().slice(0,10); }
    setTimeout(renderAttendance,50);
  }
  else if(page==='att-report'){ setTimeout(initAttReport,50); }
  else if(page==='idcards'){ setTimeout(()=>renderIdCardList(),50); }
  else if(page==='exams'){ setTimeout(()=>renderExams(),50); }
  else if(page==='receipt'){
    populateDataLists();
    if(window.innerWidth<=768){
      // Mobile: show form tab first, ensure both panels exist
      const fp=document.querySelector('.receipt-form-panel');
      const pp=document.querySelector('.receipt-preview-panel');
      if(fp) fp.style.display='';
      if(pp) pp.style.display='none';
      const tf=document.getElementById('tab-form');
      const tp=document.getElementById('tab-preview');
      if(tf){ tf.classList.add('active'); }
      if(tp){ tp.classList.remove('active'); }
    }
    // Scale after layout is painted — double rAF ensures paint is complete
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        scaleReceipt();
      });
    });
  }
  // Show/hide mobile action bar
  const mba=document.getElementById('receiptMobileActions');
  if(mba) mba.style.display=(page==='receipt'&&window.innerWidth<=768)?'flex':'none';
}
/** Opens/closes the mobile slide-out sidebar and its dimming overlay. */
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  if(ov) ov.classList.toggle('show',sb.classList.contains('open'));
}
/** Forces the mobile sidebar (and its overlay) closed. */
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  const ov=document.getElementById('sidebarOverlay');
  if(ov) ov.classList.remove('show');
}
/** Displays a brief bottom-of-screen toast message, color-coded by type
 * (success/error/info), auto-hiding after 3s. */
function showToast(msg,type='info'){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.className='toast show';
  if(type==='success') t.style.background='#166534';
  else if(type==='error') t.style.background='#991b1b';
  else t.style.background='#1e293b';
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('show'),3000);
}
/** Adds the 'open' class to a modal by id, making it visible (visibility/animation is
 * handled by CSS). */
function openModal(id){ document.getElementById(id).classList.add('open'); }
/** Removes the 'open' class from a modal by id, hiding it. */
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

// ══════════════════════════════════════════
//  WORDS
// ══════════════════════════════════════════
/** Converts a rupee amount into words (e.g. 1250 -> 'One Thousand Two Hundred Fifty Only')
 * for the receipt's amount-in-words line. cvt() is the recursive Indian-numbering
 * (Lakh/Thousand) helper. */
function toWords(n){
  const num=Math.round(parseFloat(n)||0);
  if(!num)return '';
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function cvt(n){
    if(n<20)return ones[n];
    if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');
    if(n<1000)return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+cvt(n%100):'');
    if(n<100000)return cvt(Math.floor(n/1000))+' Thousand'+(n%1000?' '+cvt(n%1000):'');
    return cvt(Math.floor(n/100000))+' Lakh'+(n%100000?' '+cvt(n%100000):'');
  }
  return cvt(num)+' Only';
}

// ══════════════════════════════════════════
//  CELL BOXES
// ══════════════════════════════════════════
/** Renders a string into individual boxed characters (used for things like registration
 * numbers shown in bordered cell grids) — pads out to `count` cells even if the string is
 * shorter. */
function makeCells(id,str,count){
  const el=document.getElementById(id); if(!el)return;
  const chars=(str||'').split('');
  el.innerHTML='';
  for(let i=0;i<count;i++){
    const d=document.createElement('div'); d.className='cell';
    d.textContent=chars[i]||''; el.appendChild(d);
  }
}
/** Like makeCells() but for multi-part values (e.g. a date split into DD / MM / YY groups)
 * with a visual spacer div between each part. */
function makeCellsGap(id,parts){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML='';
  parts.forEach((p,pi)=>{
    if(pi>0){const sp=document.createElement('div');sp.className='cell-spacer';el.appendChild(sp);}
    const chars=(p.val||'').split('');
    for(let i=0;i<p.len;i++){
      const d=document.createElement('div');d.className='cell';
      d.textContent=chars[i]||'';el.appendChild(d);
    }
  });
}

// ══════════════════════════════════════════
//  QUICK LOAD STUDENT (from App 2)
// ══════════════════════════════════════════
/** Rebuilds the student <select> dropdown, grouped into Ongoing / Completed / (from
 * receipt history but not yet a student record) optgroups, preserving whatever was
 * previously selected. */
function populateStudentSelect(){
  const sel=document.getElementById('f_student_select');
  if(!sel)return;
  const current=sel.value;
  sel.innerHTML='<option value="">— Manual Entry / New Student —</option>';
  const students=DB.get('mv_students',[]);
  const ongoing=students.filter(s=>s.courseStatus!=='completed');
  const completed=students.filter(s=>s.courseStatus==='completed');
  // Ongoing students first
  if(ongoing.length){
    const grp=document.createElement('optgroup'); grp.label='🟢 Ongoing Students';
    ongoing.forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=s.name+(s.regNo?' ('+s.regNo+')':''); grp.appendChild(o); });
    sel.appendChild(grp);
  }
  // Completed students (returning / re-enrolling)
  if(completed.length){
    const grp=document.createElement('optgroup'); grp.label='🎓 Completed / Returning Students';
    completed.forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=s.name+(s.regNo?' ('+s.regNo+')':''); grp.appendChild(o); });
    sel.appendChild(grp);
  }
  // Also include from receipt history not in students DB
  const receipts=DB.get('mv_receipts',[]);
  const knownNames=new Set(students.map(s=>s.name.toLowerCase()));
  const seen=new Set();
  const histItems=[];
  receipts.forEach(r=>{
    if(!knownNames.has(r.studentName.toLowerCase())&&!seen.has(r.studentName)){
      seen.add(r.studentName);
      histItems.push(r);
    }
  });
  if(histItems.length){
    const grp=document.createElement('optgroup'); grp.label='📂 From Receipt History';
    histItems.forEach(r=>{ const o=document.createElement('option'); o.value='hist:'+r.studentName+'::'+r.regNo+'::'+r.program+'::'+r.batch; o.textContent=r.studentName+(r.regNo?' ('+r.regNo+')':'')+' [history]'; grp.appendChild(o); });
    sel.appendChild(grp);
  }
  if(current) sel.value=current;
}

/** Refreshes the shared <datalist> autocomplete options for course names and batch names
 * from mv_courses, then also refreshes the student select dropdown. */
function populateDataLists(){
  const courses=DB.get('mv_courses',[]);
  const cl=document.getElementById('courseList');
  const bl=document.getElementById('batchList');
  if(cl){ cl.innerHTML=''; courses.forEach(c=>{ const o=document.createElement('option'); o.value=c.name; cl.appendChild(o); }); }
  if(bl){ bl.innerHTML=''; courses.forEach(c=>{ (c.batches||[]).forEach(b=>{ const o=document.createElement('option'); o.value=b; bl.appendChild(o); }); }); }
  populateStudentSelect();
}

// Student autocomplete
let autoTimeout=null;
/** Scans all non-completed students for fee-related alerts: overdue instalments, due-today
 * instalments, instalments due within 7 days, and general outstanding balances (when no
 * instalment schedule exists). Returns them sorted urgent-first. */
function buildNotifications(){
  const students=DB.get('mv_students',[]);
  const notifs=[];
  const today=new Date(); today.setHours(0,0,0,0);

  students.forEach(s=>{
    if(s.courseStatus==='completed') return;
    const totalFee=s.totalFee||0;
    const paid=s.feesPaid||0;
    const due=Math.max(0,totalFee-paid);
    // If the student's real balance is already settled, don't flag them just because an old
    // instalment row was never manually marked "Paid" — this is what kept the sidebar badge
    // count out of sync with the (correctly balance-based) Dues page list.
    if(due<=0) return;

    // Check overdue instalments
    if(s.instalments&&s.instalments.length){
      s.instalments.forEach((inst,idx)=>{
        if(inst.status==='paid') return;
        if(!inst.dueDate) return;
        const dueD=new Date(inst.dueDate); dueD.setHours(0,0,0,0);
        const diffDays=Math.round((today-dueD)/(1000*60*60*24)); // >0 = overdue, 0 = due today, <0 = still upcoming
        if(diffDays>0){
          notifs.push({
            id:`overdue_${s.id}_${idx}`,
            type:'urgent',
            studentId:s.id,
            studentName:s.name,
            regNo:s.regNo||'',
            title:`Overdue Instalment — ${s.name}`,
            msg:`Instalment ${idx+1} of ₹${fmtFull(inst.amount||0)} was due ${diffDays} day${diffDays>1?'s':''} ago (${inst.dueDate})`,
            tag:'🔴 Overdue',
            amount:inst.amount||0,
            sortKey:diffDays*1000+(due)
          });
        } else if(diffDays===0){
          notifs.push({
            id:`duetoday_${s.id}_${idx}`,
            type:'warning',
            studentId:s.id,
            studentName:s.name,
            regNo:s.regNo||'',
            title:`Due Today — ${s.name}`,
            msg:`Instalment ${idx+1} of ₹${fmtFull(inst.amount||0)} is due today`,
            tag:'🟡 Due Today',
            amount:inst.amount||0,
            sortKey:500
          });
        } else if(diffDays>=-7){
          notifs.push({
            id:`upcoming_${s.id}_${idx}`,
            type:'info',
            studentId:s.id,
            studentName:s.name,
            regNo:s.regNo||'',
            title:`Upcoming Instalment — ${s.name}`,
            msg:`Instalment ${idx+1} of ₹${fmtFull(inst.amount||0)} due in ${-diffDays} day${-diffDays>1?'s':''} (${inst.dueDate})`,
            tag:'🔵 Upcoming',
            amount:inst.amount||0,
            sortKey:10-(-diffDays)
          });
        }
      });
    }

    // General fee balance due (only if no instalment schedule)
    if(due>0 && (!s.instalments||!s.instalments.length)){
      const pct=totalFee>0?Math.round(paid/totalFee*100):0;
      notifs.push({
        id:`due_${s.id}`,
        type: pct<30?'urgent':'warning',
        studentId:s.id,
        studentName:s.name,
        regNo:s.regNo||'',
        title:`Fee Balance Pending — ${s.name}`,
        msg:`₹${fmtFull(due)} remaining out of ₹${fmtFull(totalFee)} total fee (${pct}% paid)`,
        tag: pct<30?'🔴 High Due':'🟡 Pending',
        amount:due,
        sortKey:due
      });
    }
  });

  // Sort: urgent first, then by sortKey desc
  notifs.sort((a,b)=>{
    const order={urgent:0,warning:1,info:2};
    if(order[a.type]!==order[b.type]) return order[a.type]-order[b.type];
    return b.sortKey-a.sortKey;
  });
  return notifs;
}

/** Recomputes and updates the sidebar 'dues' count badge and the notification bell's
 * unread badge; also refreshes the open notification panel if it's currently visible. */
function updateDuesBadge(){
  const students=DB.get('mv_students',[]);
  const receipts=DB.get('mv_receipts',[]);
  const active=receipts.filter(r=>r.status==='active');
  // Student-based dues
  const stuDueCount=students.filter(s=>s.courseStatus!=='completed'&&(s.totalFee||0)>(s.feesPaid||0)).length;
  // Receipt-based dues (next instalment set, student not in DB)
  const trackedNames=new Set(students.map(s=>s.name.toLowerCase()));
  const receiptDueNames=new Set();
  active.forEach(r=>{
    const hasNext=(r.nextInstDate&&r.nextInstDate.trim())||(r.nextInstMonth&&r.nextInstMonth.trim())||(r.nextInstYear&&r.nextInstYear.trim());
    if(hasNext&&!trackedNames.has(r.studentName.toLowerCase())) receiptDueNames.add(r.studentName.toLowerCase());
  });
  const dueCount=stuDueCount+receiptDueNames.size;
  const badge=document.getElementById('duesBadge');
  if(badge){ badge.textContent=dueCount; badge.style.display=dueCount>0?'inline':'none'; }
  // Update bell badge
  const notifs=buildNotifications();
  const unread=notifs.filter(n=>!_readNotifIds.has(n.id));
  const bellBadge=document.getElementById('notifBadge');
  if(bellBadge){ bellBadge.textContent=unread.length>99?'99+':unread.length; bellBadge.style.display=unread.length>0?'inline':'none'; }
  const panelCount=document.getElementById('notifPanelCount');
  if(panelCount) panelCount.textContent=notifs.length+' alert'+(notifs.length!==1?'s':'');
  if(_notifPanelOpen) renderNotifList(notifs);
}

/** Opens the notification panel (rebuilding its contents) if closed, or closes it if
 * already open. */
function toggleNotifPanel(){
  if(_notifPanelOpen){ closeNotifPanel(); return; }
  _notifPanelOpen=true;
  const panel=document.getElementById('notifPanel');
  const overlay=document.getElementById('notifOverlay');
  panel.style.display='flex';
  overlay.style.display='block';
  const notifs=buildNotifications();
  const panelCount=document.getElementById('notifPanelCount');
  if(panelCount) panelCount.textContent=notifs.length+' alert'+(notifs.length!==1?'s':'');
  renderNotifList(notifs);
}

/** Hides the notification panel and its overlay. */
function closeNotifPanel(){
  _notifPanelOpen=false;
  document.getElementById('notifPanel').style.display='none';
  document.getElementById('notifOverlay').style.display='none';
}

/** Renders the notification panel's contents, grouped into Overdue / Due-Today / Upcoming
 * sections, or an empty-state message if there's nothing pending. */
function renderNotifList(notifs){
  const list=document.getElementById('notifList');
  if(!notifs.length){
    list.innerHTML=`<div class="notif-empty"><div class="notif-empty-icon">🎉</div><div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">All caught up!</div><div style="font-size:13px;">No pending fee dues or overdue instalments.</div></div>`;
    return;
  }
  const urgent=notifs.filter(n=>n.type==='urgent');
  const warning=notifs.filter(n=>n.type==='warning');
  const info=notifs.filter(n=>n.type==='info');

  let html='';
  if(urgent.length){ html+=`<div class="notif-section-label">🔴 Overdue / High Priority (${urgent.length})</div>`; html+=urgent.map(n=>notifItemHTML(n)).join(''); }
  if(warning.length){ html+=`<div class="notif-section-label">🟡 Due Today / Pending (${warning.length})</div>`; html+=warning.map(n=>notifItemHTML(n)).join(''); }
  if(info.length){ html+=`<div class="notif-section-label">🔵 Upcoming (${info.length})</div>`; html+=info.map(n=>notifItemHTML(n)).join(''); }
  list.innerHTML=html;
}

/** Builds the HTML for a single notification row: avatar initials, title/message, priority
 * tag, and a Quick Receipt action button. */
function notifItemHTML(n){
  const isUnread=!_readNotifIds.has(n.id);
  const initials=n.studentName.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  return `<div class="notif-item ${isUnread?'unread':''} ${n.type}" onclick="notifItemClick('${n.id}','${n.studentId}')">
    <div class="notif-avatar ${n.type}">${initials}</div>
    <div class="notif-body">
      <div class="notif-title">${n.title}</div>
      <div class="notif-msg">${n.msg}</div>
      <div class="notif-meta">
        <span class="notif-tag ${n.type}">${n.tag}</span>
        ${n.regNo?`<span style="font-size:10px;color:var(--muted);">${n.regNo}</span>`:''}
        <button class="notif-action" onclick="event.stopPropagation();notifQuickReceipt('${n.studentId}')">🖨 Quick Receipt</button>
      </div>
    </div>
  </div>`;
}

/** Marks a notification as read and takes the user to the Dues page to follow up. */
function notifItemClick(notifId, studentId){
  _readNotifIds.add(notifId);
  localStorage.setItem('mv_read_notifs',JSON.stringify([..._readNotifIds]));
  updateDuesBadge();
  closeNotifPanel();
  navigate('dues');
}

/** Marks the underlying due-balance notification as read and jumps straight into a
 * pre-filled receipt for that student. */
function notifQuickReceipt(studentId){
  _readNotifIds.add('due_'+studentId);
  localStorage.setItem('mv_read_notifs',JSON.stringify([..._readNotifIds]));
  closeNotifPanel();
  quickReceipt(studentId);
}

/** Marks every current notification as read, re-renders the (now empty-looking) list, and
 * confirms with a toast. */
function markAllNotifsRead(){
  const notifs=buildNotifications();
  notifs.forEach(n=>_readNotifIds.add(n.id));
  localStorage.setItem('mv_read_notifs',JSON.stringify([..._readNotifIds]));
  updateDuesBadge();
  renderNotifList(notifs);
  showToast('All notifications marked as read','success');
}
// ══════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════
/** Populates the Settings form fields from saved institute settings, including logo/stamp
 * image previews and the dynamic fee-label inputs. */
function loadSettings(){
  const s=DB.get('mv_settings',{});
  const sv=(id,val)=>{ const e=document.getElementById(id); if(e&&val!==undefined)e.value=val; };
  sv('s_name',s.instituteName||'MICROVISION');
  sv('s_subtitle',s.instituteSubtitle||'ADVANCED TECHNOLOGY INSTITUTE');
  sv('s_address',s.instituteAddress||'125, Block-C, Shyam Nagar, 200 Ft. P.A.C. Road, Kanpur-13');
  sv('s_mob',s.instituteMob||'Mob: 9415480358, 9026165524');
  sv('s_email',s.instituteEmail||'microvisionknp@gmail.com');
  sv('s_rating',s.ratingText||'Google Five Star Rating Institute');
  sv('s_counter',s.receiptCounter||1);
  sv('s_prefix',s.receiptPrefix||'');

  // Logo/stamp previews
  if(s.logoBase64){ const img=document.getElementById('logoPreview'); img.src=s.logoBase64; img.style.display='block'; }
  if(s.stampBase64){ const img=document.getElementById('stampPreview'); img.src=s.stampBase64; img.style.display='block'; }

  // Fee labels
  const labels=s.feeLabels||['Admission fee','Registration fee','Initial Payment','Instalment Payment','UPI ID.','Special'];
  const fc=document.getElementById('feeLabelFields');
  fc.innerHTML=labels.map((l,i)=>`<div class="field"><label>Row ${i+1} Label</label><input id="fl_${i}" value="${l}"/></div>`).join('');
}

/** Pushes institute settings (name, address, contact, logo, stamp) into the receipt
 * preview's DOM elements. Used on every page so institute branding stays consistent even
 * outside the receipts page. */
function applyInstituteToReceipt(s){
  const set=(id,v)=>{ const e=document.getElementById(id); if(e)e.textContent=v; };
  // r_brandName needs innerHTML (not textContent) to render the ® superscript
  const brandEl=document.getElementById('r_brandName');
  if(brandEl) brandEl.innerHTML=(s.instituteName||'MICROVISION')+'<sup style="font-size:11px;vertical-align:super;line-height:0;">®</sup>';
  set('r_instituteName',s.instituteSubtitle||'ADVANCED TECHNOLOGY INSTITUTE');
  set('r_addr',s.instituteAddress||'125, Block-C, Shyam Nagar, 200 Ft. P.A.C. Road, Kanpur-13');
  set('r_mob',s.instituteMob||'Mob: 9415480358, 9026165524');
  set('r_email',s.instituteEmail||'microvisionknp@gmail.com');
  const logo=document.getElementById('r_logo');
  if(logo){ if(s.logoBase64){ logo.src=s.logoBase64; logo.style.display='block'; }else{ logo.style.display='none'; } }
  const stamp=document.getElementById('r_stamp');
  if(stamp){ if(s.stampBase64){ stamp.src=s.stampBase64; stamp.style.display='block'; }else{ stamp.style.display='none'; } }
}

// PAGE_DEFAULT is set inline in each HTML page before shared.js's bootstrap runs,
// e.g. <script>const PAGE_DEFAULT='receipt';</script>. Falls back to 'dashboard'.
// PAGE_READY (optional) is a page-specific callback for extra init, defined in
// that page's own module file (e.g. receipts.js primes the receipt form).
/** Runs once the main app shell is visible: applies institute branding, navigates to this
 * page's default tab (or the ?tab= override), then — after first paint — refreshes
 * datalists/dues badge and runs any page-specific PAGE_READY hook. */
function initApp(){
  const s=DB.get('mv_settings',{});
  applyInstituteToReceipt(s);
  navigate(typeof PAGE_DEFAULT!=='undefined'?PAGE_DEFAULT:'dashboard');

  setTimeout(()=>{
    populateDataLists();
    updateDuesBadge();
    if(typeof PAGE_READY==='function') PAGE_READY(s);
  },80);
}

// ══════════════════════════════════════════
//  DEVTOOLS PROTECTION
// ══════════════════════════════════════════
(function(){
  // Disable right-click context menu
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U (desktop only — no effect on mobile)
  document.addEventListener('keydown', e => {
    if(
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' ||
        e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
      (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
    ){
      e.preventDefault();
      return false;
    }
  });

  // DevTools size detection — DESKTOP ONLY.
  // Mobile browsers have large chrome UI (address bar, nav bar) that easily
  // exceeds 160px difference, causing false positives that wipe the app.
  // We only run this check on non-touch desktop screens.
  const isDesktop = () => !('ontouchstart' in window) && window.innerWidth > 1024;
  const devToolsWarning = () => {
    if(!isDesktop()) return; // skip entirely on mobile/tablet
    const threshold = 200; // raised threshold to avoid false positives
    if(
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ){
      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;
          height:100vh;background:#0f2744;flex-direction:column;gap:16px;">
          <div style="font-size:48px;">🔒</div>
          <div style="color:#fff;font-size:22px;font-weight:800;font-family:sans-serif;">Access Restricted</div>
          <div style="color:#94a3b8;font-size:14px;font-family:sans-serif;">Developer tools are not allowed.</div>
          <button onclick="location.reload()" style="margin-top:12px;padding:10px 24px;
            background:#2563eb;color:#fff;border:none;border-radius:8px;
            font-size:14px;font-weight:600;cursor:pointer;font-family:sans-serif;">
            Reload App
          </button>
        </div>`;
    }
  };
  setInterval(devToolsWarning, 1500);

  // NOTE: Debugger trap removed — it fires on slow/mid-range phones
  // because the JS engine pause >100ms causing the app to wipe itself.
})();

// ══════════════════════════════════════════
//  STARTUP
// ══════════════════════════════════════════
window.addEventListener('load',()=>{
  // window.onload fires after ALL external scripts are fully loaded
  initFirebase();

  // Keyboard support for PIN screen
  document.addEventListener('keydown',e=>{
    if(document.getElementById('loginScreen').style.display==='flex'){
      if(e.key>='0'&&e.key<='9') pinPress(e.key);
      else if(e.key==='Backspace') pinClear();
      else if(e.key==='Enter') pinSubmit();
    }
  });
  // PWA install manifest
  injectPWAManifest();
  // Register service worker for offline support
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('data:text/javascript;charset=utf-8,'+encodeURIComponent(`
      const CACHE='mv-v1';
      self.addEventListener('install',e=>{ self.skipWaiting(); });
      self.addEventListener('activate',e=>{ e.waitUntil(clients.claim()); });
      self.addEventListener('fetch',e=>{
        if(e.request.method!=='GET') return;
        e.respondWith(
          caches.open(CACHE).then(cache=>
            fetch(e.request).then(res=>{ cache.put(e.request,res.clone()); return res; })
            .catch(()=>caches.match(e.request))
          )
        );
      });
    `)).catch(()=>{});
  }
});

/** Builds a PWA manifest on the fly (as a Blob URL) and attaches it to <head>, so the app
 * can be 'installed' to a home screen without needing a static manifest.json file. */
function injectPWAManifest(){
  const manifest={
    name:'Microvision Management System',
    short_name:'Microvision',
    description:'Complete Institute Management System',
    start_url:window.location.href,
    display:'standalone',
    background_color:'#0f2744',
    theme_color:'#0f2744',
    orientation:'portrait-primary',
    icons:[
      {src:'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%230f2744"/><text y=".9em" font-size="80" x="10">🎓</text></svg>',sizes:'192x192',type:'image/svg+xml'},
      {src:'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%230f2744"/><text y=".9em" font-size="80" x="10">🎓</text></svg>',sizes:'512x512',type:'image/svg+xml'}
    ]
  };
  const blob=new Blob([JSON.stringify(manifest)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('link');
  link.rel='manifest'; link.href=url;
  document.head.appendChild(link);
}

// ══════════════════════════════════════════════════════════════
//  EXAM MARKS & GRADE SYSTEM
// ══════════════════════════════════════════════════════════════

// Grade calculator — your exact rules

/** Bundles receipts, students, courses and settings into one JSON file and triggers a
 * download — the manual backup used by Settings > Export and the sidebar Backup button on
 * every page. */
function exportBackup(){
  const data={
    receipts:DB.get('mv_receipts',[]),
    students:DB.get('mv_students',[]),
    courses:DB.get('mv_courses',[]),
    settings:DB.get('mv_settings',{}),
    exportedAt:new Date().toISOString(),
    version:'2.0'
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='Microvision_Backup_'+new Date().toLocaleDateString('en-IN').replace(/\//g,'-')+'.json';
  a.click();
  showToast('Backup downloaded!','success');
}
