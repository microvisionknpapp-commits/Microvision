/** Saves the institute's name/subtitle/address/mobile/email/rating text from the Settings
 * form and immediately re-applies them to the receipt preview. */
function saveInstituteSettings(){
  const s=DB.get('mv_settings',{});
  s.instituteName=document.getElementById('s_name').value;
  s.instituteSubtitle=document.getElementById('s_subtitle').value;
  s.instituteAddress=document.getElementById('s_address').value;
  s.instituteMob=document.getElementById('s_mob').value;
  s.instituteEmail=document.getElementById('s_email').value;
  s.ratingText=document.getElementById('s_rating').value;
  DB.set('mv_settings',s);
  applyInstituteToReceipt(s);
  showToast('Settings saved!','success');
}
/** Validates (must match, must be exactly 4 digits) and saves a new PIN lock, or clears it
 * entirely if the field is left blank. */
function savePinSettings(){
  const p1=document.getElementById('s_pin').value;
  const p2=document.getElementById('s_pin2').value;
  if(p1&&p1!==p2){ showToast('PINs do not match','error'); return; }
  if(p1&&(p1.length!==4||!/^\d{4}$/.test(p1))){ showToast('PIN must be exactly 4 digits','error'); return; }
  const s=DB.get('mv_settings',{});
  s.pin=p1||'';
  DB.set('mv_settings',s);
  showToast(p1?'PIN set successfully!':'PIN removed','success');
  document.getElementById('s_pin').value='';
  document.getElementById('s_pin2').value='';
}

/** Saves the next receipt number and an optional prefix used by setAutoReceiptNo() to
 * generate future receipt numbers. */
function saveCounterSettings(){
  const s=DB.get('mv_settings',{});
  s.receiptCounter=parseInt(document.getElementById('s_counter').value)||1;
  s.receiptPrefix=document.getElementById('s_prefix').value||'';
  DB.set('mv_settings',s);
  showToast('Counter saved!','success');
}

/** Saves the 6 customizable fee-row labels (e.g. 'Admission fee') used on the receipt
 * table, falling back to the defaults for any left blank. */
function saveFeeLabels(){
  const labels=[];
  for(let i=0;i<6;i++){
    const e=document.getElementById('fl_'+i);
    labels.push(e?e.value:['Admission fee','Registration fee','Initial Payment','Instalment Payment','UPI ID.','Special'][i]);
  }
  const s=DB.get('mv_settings',{});
  s.feeLabels=labels; DB.set('mv_settings',s);
  showToast('Labels saved!','success');
}

/** Reads the chosen logo image as a base64 data URL, saves it to settings, updates the
 * preview, and pushes it onto the live receipt. */
function uploadLogo(input){
  const file=input.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const s=DB.get('mv_settings',{});
    s.logoBase64=e.target.result; DB.set('mv_settings',s);
    document.getElementById('logoPreview').src=e.target.result;
    document.getElementById('logoPreview').style.display='block';
    applyInstituteToReceipt(s);
    showToast('Logo uploaded!','success');
  };
  reader.readAsDataURL(file);
}
/** Clears the saved institute logo from settings and hides it in the receipt preview. */
function removeLogo(){
  const s=DB.get('mv_settings',{}); s.logoBase64=''; DB.set('mv_settings',s);
  document.getElementById('logoPreview').style.display='none';
  const r=document.getElementById('r_logo'); if(r)r.style.display='none';
  showToast('Logo removed');
}
/** Reads the chosen stamp/signature image as a base64 data URL, saves it to settings,
 * updates the settings-page preview, and pushes it onto the live receipt. */
function uploadStamp(input){
  const file=input.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const s=DB.get('mv_settings',{});
    s.stampBase64=e.target.result; DB.set('mv_settings',s);
    document.getElementById('stampPreview').src=e.target.result;
    document.getElementById('stampPreview').style.display='block';
    const stamp=document.getElementById('r_stamp');
    if(stamp){ stamp.src=e.target.result; stamp.style.display='block'; }
    showToast('Stamp uploaded!','success');
  };
  reader.readAsDataURL(file);
}
/** Clears the saved stamp image from settings and hides it in the receipt preview. */
function removeStamp(){
  const s=DB.get('mv_settings',{}); s.stampBase64=''; DB.set('mv_settings',s);
  document.getElementById('stampPreview').style.display='none';
  const stamp=document.getElementById('r_stamp'); if(stamp)stamp.style.display='none';
  showToast('Stamp removed');
}

// ══════════════════════════════════════════
//  BACKUP & RESTORE
// ══════════════════════════════════════════
/** Restores receipts/students/courses/settings from a previously exported backup JSON
 * file, after confirming the destructive overwrite, then re-initializes the app to reflect
 * the restored data. */
function importBackup(input){
  const file=input.files[0]; if(!file)return;
  if(!confirm('This will replace ALL existing data. Are you sure?')){ input.value=''; return; }
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.receipts)DB.set('mv_receipts',data.receipts);
      if(data.students)DB.set('mv_students',data.students);
      if(data.courses)DB.set('mv_courses',data.courses);
      if(data.settings)DB.set('mv_settings',data.settings);
      showToast('Backup restored successfully!','success');
      initApp();
    }catch(err){ showToast('Invalid backup file','error'); }
    input.value='';
  };
  reader.readAsText(file);
}

// ══════════════════════════════════════════
//  STUDENT PHOTO
// ══════════════════════════════════════════
