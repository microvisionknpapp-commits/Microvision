// ══════════════════════════════════════════
//  STUDENT PORTAL — a separate login realm from the admin/staff app.
//  Students authenticate with a Firebase Auth account built from their
//  Registration No + a self-chosen PIN (never a real email address). This file
//  is intentionally self-contained (its own Firebase config constants, its own
//  auth/session handling) so the student portal never shares code paths with
//  the admin app's shared.js — a student login can only ever do what's written
//  here, and what's written here only ever touches the Firestore paths that the
//  security rules (see firestore.rules) restrict to that student's own data.
// ══════════════════════════════════════════
const FB_API_KEY = 'AIzaSyAbd6Ox0TosK-rbODbmQJRj_TwhJjgmQ9o';
const FB_PROJECT = 'microvision-ea8c0';
const AUTH_BASE  = 'https://identitytoolkit.googleapis.com/v1/accounts';
const FS_BASE    = 'https://firestore.googleapis.com/v1/projects/'+FB_PROJECT+'/databases/(default)/documents';
const TOKEN_URL  = 'https://securetoken.googleapis.com/v1/token';

/** Turns a Registration No into the synthetic email Firebase Auth needs internally
 * — students never see or type this, it's just how we reuse Firebase Auth for a
 * Reg-No-based login instead of a real email address. */
function regNoToEmail(regNo){ return regNo.trim().toLowerCase().replace(/[^a-z0-9]/g,'')+'@students.microvision.local'; }

/** Turns a short PIN into a Firebase-Auth-valid password (Firebase requires 6+
 * characters). The fixed prefix is just padding, not secrecy — real access
 * control comes from the Firestore Security Rules, not from this being hidden. */
function pinToPassword(pin){ return 'MVSTU-'+pin; }

/** Saves/loads/clears the student's session in its own localStorage key, separate
 * from the admin app's 'mv_auth' key. */
function _saveStudentAuth(u){ localStorage.setItem('mv_student_auth',JSON.stringify(u)); }
function _loadStudentAuth(){ try{ const a=localStorage.getItem('mv_student_auth'); return a?JSON.parse(a):null; }catch(e){ return null; } }
function _clearStudentAuth(){ localStorage.removeItem('mv_student_auth'); }

/** Exchanges the saved refresh token for a fresh ID token (tokens expire hourly) —
 * same pattern as the admin app's _getToken(), against the student's own session. */
async function _getStudentToken(){
  const a=_loadStudentAuth(); if(!a) return null;
  try{
    const r=await fetch(TOKEN_URL+'?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({grant_type:'refresh_token',refresh_token:a.refreshToken})});
    const d=await r.json();
    if(d.id_token){ a.idToken=d.id_token; a.refreshToken=d.refresh_token; a.uid=d.user_id; _saveStudentAuth(a); return d.id_token; }
  }catch(e){ console.warn('Student token refresh failed',e); }
  return a.idToken;
}

/** Shows an error message in the login/register form's shared error slot. */
function showStudentAuthError(msg){ const el=document.getElementById('studentAuthError'); if(el) el.textContent=msg; }

/** Looks up a Registration No in the public /directory collection. Returns null if
 * it doesn't exist, otherwise {regNo,name,courseId,claimed,uid}. No login is
 * needed for this — the Firestore rules allow anyone to fetch ONE directory doc
 * by its exact Reg No (but never list the whole collection), so this can check
 * "does this Reg No exist and is it still unclaimed?" safely from a fresh visitor. */
async function checkDirectory(regNo){
  try{
    const r=await fetch(FS_BASE+'/directory/'+encodeURIComponent(regNo.trim().toUpperCase())+'?key='+FB_API_KEY);
    if(r.status===404) return null;
    const d=await r.json();
    if(!d.fields) return null;
    return {
      regNo:d.fields.regNo?.stringValue||'', name:d.fields.name?.stringValue||'',
      courseId:d.fields.courseId?.stringValue||'', claimed:d.fields.claimed?.booleanValue||false,
      uid:d.fields.uid?.stringValue||''
    };
  }catch(e){ console.warn('Directory lookup failed',e); return null; }
}

/** Registers a brand-new student login: checks the Reg No exists and hasn't been
 * claimed yet, creates a Firebase Auth account for it, then marks the directory
 * entry claimed and linked to this new login. The Firestore rules only allow that
 * claimed:false→true transition once per Reg No, so this can't be repeated. */
async function studentRegister(regNo, pin, confirmPin){
  showStudentAuthError('');
  regNo=regNo.trim().toUpperCase();
  if(!regNo){ showStudentAuthError('Enter your Registration No.'); return; }
  if(pin.length<4){ showStudentAuthError('PIN must be at least 4 digits.'); return; }
  if(pin!==confirmPin){ showStudentAuthError('PINs do not match.'); return; }

  const entry=await checkDirectory(regNo);
  if(!entry){ showStudentAuthError('Registration No not found. Check with your institute.'); return; }
  if(entry.claimed){ showStudentAuthError('This Registration No is already registered — please log in instead.'); return; }

  const email=regNoToEmail(regNo), password=pinToPassword(pin);
  try{
    const r=await fetch(AUTH_BASE+':signUp?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password,returnSecureToken:true})});
    const d=await r.json();
    if(d.error){ showStudentAuthError('Could not create your login. Try a different PIN.'); return; }
    _saveStudentAuth({uid:d.localId,email,idToken:d.idToken,refreshToken:d.refreshToken});

    // Claim the directory entry so this Reg No can't be registered a second time.
    await fetch(FS_BASE+'/directory/'+encodeURIComponent(regNo)+'?key='+FB_API_KEY,{
      method:'PATCH',headers:{'Content-Type':'application/json','Authorization':'Bearer '+d.idToken},
      body:JSON.stringify({fields:{
        regNo:{stringValue:entry.regNo}, name:{stringValue:entry.name}, courseId:{stringValue:entry.courseId},
        claimed:{booleanValue:true}, uid:{stringValue:d.localId}
      }})
    });
    location.href='student-portal.html';
  }catch(e){ showStudentAuthError('Registration failed. Check your connection and try again.'); }
}

/** Logs an already-registered student back in using the same Reg No + PIN. */
async function studentLogin(regNo, pin){
  showStudentAuthError('');
  regNo=regNo.trim().toUpperCase();
  if(!regNo||!pin){ showStudentAuthError('Enter your Registration No and PIN.'); return; }
  const email=regNoToEmail(regNo), password=pinToPassword(pin);
  try{
    const r=await fetch(AUTH_BASE+':signInWithPassword?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password,returnSecureToken:true})});
    const d=await r.json();
    if(d.error){ showStudentAuthError('Registration No or PIN is incorrect.'); return; }
    _saveStudentAuth({uid:d.localId,email,idToken:d.idToken,refreshToken:d.refreshToken});
    location.href='student-portal.html';
  }catch(e){ showStudentAuthError('Login failed. Check your connection and try again.'); }
}

/** Signs the student out and returns them to the login screen. */
function studentLogout(){ _clearStudentAuth(); location.href='student-login.html'; }

/** Guards the portal page: bounces back to login if there's no saved session. */
function requireStudentAuth(){
  const a=_loadStudentAuth();
  if(!a){ location.href='student-login.html'; return null; }
  return a;
}

/** Fetches this student's own mirrored data doc (attendance/marks/fees) — the
 * Firestore rules only allow this because the document id equals their own
 * auth.uid, so there's no way to fetch anyone else's by editing this code. */
async function loadMyStudentData(){
  const token=await _getStudentToken(); const a=_loadStudentAuth(); if(!token||!a) return null;
  try{
    const r=await fetch(FS_BASE+'/studentData/'+a.uid+'?key='+FB_API_KEY,{headers:{'Authorization':'Bearer '+token}});
    if(r.status===404) return null;
    const d=await r.json();
    return d.fields?.value?.stringValue?JSON.parse(d.fields.value.stringValue):null;
  }catch(e){ console.warn('Load student data failed',e); return null; }
}

/** Fetches every admin notice and filters to ones addressed to "all" students or
 * specifically to this student's Reg No or course. */
async function loadMyNotices(myData){
  const token=await _getStudentToken(); if(!token) return [];
  try{
    const r=await fetch(FS_BASE+'/notices?key='+FB_API_KEY+'&pageSize=100',{headers:{'Authorization':'Bearer '+token}});
    const d=await r.json();
    const all=(d.documents||[]).map(doc=>{
      try{ return JSON.parse(doc.fields?.value?.stringValue||'null'); }catch(e){ return null; }
    }).filter(Boolean);
    return all.filter(n=>n.audience==='all' || (myData && (
      (n.regNos&&n.regNos.includes(myData.regNo)) || (n.courseId&&n.courseId===myData.courseId)
    ))).sort((a,b)=>b.createdAt-a.createdAt);
  }catch(e){ console.warn('Load notices failed',e); return []; }
}
