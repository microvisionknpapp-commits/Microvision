let viewingReceiptId=null;
/** Handles the student-select dropdown on the receipt form: 'hist:' values (a student
 * pulled from old receipt history, not a real student record) get parsed and filled
 * manually, everything else goes through fillStudentData(). */
function quickLoadStudent(val){
  if(!val)return;
  if(val.startsWith('hist:')){
    const parts=val.slice(5).split('::');
    const setV=(id,v)=>{ const e=document.getElementById(id); if(e)e.value=v||''; };
    setV('f_name',parts[0]||'');
    setV('f_regNo',parts[1]||'');
    setV('f_program',parts[2]||'');
    setV('f_batch',parts[3]||'');
    showToast('Loaded from history: '+parts[0],'success');
  } else {
    fillStudentData(val);
  }
  renderReceipt();
}

// ══════════════════════════════════════════
//  STAMP INLINE UPLOAD (from App 2)
// ══════════════════════════════════════════
/** Handles the receipt form's inline stamp upload: previews it, applies it to the live
 * receipt preview immediately, and also saves it into institute settings so it's
 * remembered everywhere. */
function uploadStampInline(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>2*1024*1024){ showToast('Image too large (max 2MB)','error'); input.value=''; return; }
  const reader=new FileReader();
  reader.onload=e=>{
    const dataUrl=e.target.result;
    // Update UI
    const prev=document.getElementById('stampImgPreviewInline');
    const ph=document.getElementById('stampPlaceholderInline');
    const btn=document.getElementById('stampRemoveBtnInline');
    if(prev){ prev.src=dataUrl; prev.style.display='block'; }
    if(ph) ph.style.display='none';
    if(btn) btn.style.display='inline-flex';
    // Apply to receipt
    const receiptStamp=document.getElementById('r_stamp');
    if(receiptStamp){ receiptStamp.src=dataUrl; receiptStamp.style.display='block'; }
    // Also save to settings for consistency
    const s=DB.get('mv_settings',{});
    s.stampBase64=dataUrl; DB.set('mv_settings',s);
    // Sync settings stamp preview
    const settStamp=document.getElementById('stampPreview');
    if(settStamp){ settStamp.src=dataUrl; settStamp.style.display='block'; }
    showToast('✅ Stamp uploaded!','success');
  };
  reader.readAsDataURL(file);
  input.value='';
}

/** Clears the inline stamp preview, hides it on the receipt, and removes it from saved
 * settings. */
function removeStampInline(){
  const prev=document.getElementById('stampImgPreviewInline');
  const ph=document.getElementById('stampPlaceholderInline');
  const btn=document.getElementById('stampRemoveBtnInline');
  if(prev){ prev.style.display='none'; prev.src=''; }
  if(ph) ph.style.display='flex';
  if(btn) btn.style.display='none';
  const receiptStamp=document.getElementById('r_stamp');
  if(receiptStamp) receiptStamp.style.display='none';
  const s=DB.get('mv_settings',{}); s.stampBase64=''; DB.set('mv_settings',s);
  const settStamp=document.getElementById('stampPreview');
  if(settStamp) settStamp.style.display='none';
  showToast('Stamp removed');
}

// ══════════════════════════════════════════
//  DELETE RECEIPT
// ══════════════════════════════════════════
/** Permanently removes a receipt from history after confirmation (separate from Void —
 * this can't be undone). */
function deleteReceiptById(id){
  if(!confirm('Permanently delete this receipt? This cannot be undone.'))return;
  let receipts=DB.get('mv_receipts',[]);
  receipts=receipts.filter(r=>r.id!==id);
  DB.set('mv_receipts',receipts);
  renderHistory();
  showToast('Receipt deleted','success');
}


/** Shorthand: get the current value of a form field by id, or '' if the element doesn't
 * exist yet. */
function gv(id){ return (document.getElementById(id)||{}).value||''; }
/** Returns which payment-mode radio (cash/upi/split) is currently checked, defaulting to
 * 'upi'. */
function getMode(){ const r=document.querySelector('input[name="payMode"]:checked'); return r?r.value:'upi'; }

/** The core receipt-preview renderer — reads every form field, computes totals (sub total,
 * grand total, cash/UPI split), fills the boxed cell-grid fields (receipt no, date, reg
 * no, etc.), builds the fee table rows, sets the amount-in-words, shows/hides the
 * duplicate/paid watermark, generates the QR code, and re-scales the preview to fit. Runs
 * on virtually every keystroke in the form. */
function renderReceipt(){
  const receiptNo=gv('f_receiptNo'), dateStr=gv('f_date'), regNo=gv('f_regNo');
  const program=gv('f_program'), invNo=gv('f_invNo'), batch=gv('f_batch');
  const invDate=gv('f_invDate'), name=gv('f_name'), mode=getMode();
  const admFee=parseFloat(gv('f_admFee'))||0, regFee=parseFloat(gv('f_regFee'))||0;
  const initPay=parseFloat(gv('f_initPay'))||0, instPay=parseFloat(gv('f_instPay'))||0;
  const special=parseFloat(gv('f_special'))||0, upiId=gv('f_upiId');
  const splitCash=parseFloat(gv('f_splitCash'))||0, splitUpi=parseFloat(gv('f_splitUpi'))||0;
  const nid=gv('f_nid'), nim=gv('f_nim'), niy=gv('f_niy');

  const subTotal=admFee+regFee+initPay+instPay;
  const grandTotal=subTotal-special;
  const splitSum=splitCash+splitUpi;

  // Split warning
  const warn=document.getElementById('splitWarn');
  if(mode==='split'){
    if(grandTotal>0&&splitSum===grandTotal){
      warn.innerHTML='<div class="split-warn ok">✅ Split matches Grand Total '+fmtFull(grandTotal)+'</div>';
    } else if(grandTotal<=0&&splitSum>0){
      warn.innerHTML='<div class="split-warn err">⚠️ Please enter fee amounts. Split total: '+fmtFull(splitSum)+'</div>';
    } else if(grandTotal>0&&splitSum!==grandTotal){
      warn.innerHTML='<div class="split-warn err">⚠️ Cash+UPI='+fmtFull(splitSum)+' ≠ Grand Total '+fmtFull(grandTotal)+'</div>';
    } else { warn.innerHTML=''; }
  } else { warn.innerHTML=''; }

  // Cell boxes
  const dp=dateStr.split('/');
  makeCellsGap('cells_receipt',[{val:receiptNo.slice(0,4),len:4},{val:receiptNo.slice(4,8),len:4}]);
  makeCellsGap('cells_date',[{val:dp[0]||'',len:2},{val:dp[1]||'',len:2},{val:dp[2]||'',len:2}]);
  makeCellsGap('cells_regNo',[{val:regNo.slice(0,4),len:4},{val:regNo.slice(4,6),len:2},{val:regNo.slice(6,10),len:4}]);
  makeCells('cells_program',program,8);
  makeCells('cells_invNo',invNo,4);
  makeCells('cells_batch',batch,8);
  const idp=invDate.split('/');
  makeCellsGap('cells_invDate',[{val:idp[0]||'',len:2},{val:idp[1]||'',len:2},{val:idp[2]||'',len:2}]);
  makeCells('cells_nid',nid,2); makeCells('cells_nim',nim,2); makeCells('cells_niy',niy,2);
  document.getElementById('r_name').textContent=name;

  const s=DB.get('mv_settings',{});
  const labels=s.feeLabels||['Admission fee','Registration fee','Initial Payment','Instalment Payment','UPI ID.','Special'];

  // Table
  function rowCash(v){ return mode==='cash'?fmt(v):''; }
  function rowUpi(v){ return mode==='upi'?fmt(v):''; }
  const totalCashCol=mode==='cash'?fmt(subTotal):mode==='split'?fmt(splitCash):'';
  const totalUpiCol=mode==='upi'?fmt(subTotal):mode==='split'?fmt(splitUpi):'';
  const rows=[
    {label:labels[0]||'Admission fee',cash:rowCash(admFee),upi:rowUpi(admFee),total:fmt(admFee)},
    {label:labels[1]||'Registration fee',cash:rowCash(regFee),upi:rowUpi(regFee),total:fmt(regFee)},
    {label:labels[2]||'Initial Payment',cash:rowCash(initPay),upi:rowUpi(initPay),total:fmt(initPay)},
    {label:labels[3]||'Instalment Payment',cash:rowCash(instPay),upi:rowUpi(instPay),total:fmt(instPay)},
    {label:(labels[4]||'UPI ID.')+': '+upiId,cash:'',upi:'',total:''},
    {label:labels[5]||'Special',cash:'',upi:'',total:special>0?'('+fmt(special)+')':''}
  ];
  const tbody=document.getElementById('r_tbody');
  let html='';
  rows.forEach((r,i)=>{
    html+="<tr><td class='center'>"+(i+1)+".</td><td class='label-cell'>"+r.label+"</td><td class='right'>"+r.cash+"</td><td class='right'>"+r.upi+"</td><td class='right'>"+r.total+"</td></tr>";
  });
  html+="<tr><td colspan='2' class='right' style='font-weight:700;'>Total</td><td class='right'>"+totalCashCol+"</td><td class='right'>"+totalUpiCol+"</td><td class='right'></td></tr>";
  html+="<tr><td colspan='4' class='right' style='font-weight:700;'>Grand Total</td><td class='right' style='font-weight:700;'>"+(grandTotal>0?fmt(grandTotal):grandTotal===0&&subTotal>0?'0':'')+"</td></tr>";
  tbody.innerHTML=html;

  document.getElementById('r_words').textContent=toWords(grandTotal);
  document.getElementById('r_chequeNo').textContent=gv('f_chequeNo');
  document.getElementById('r_chequeDate').textContent=gv('f_chequeDate');
  document.getElementById('r_drawn').textContent=gv('f_drawn');

  // Watermark
  const wm=document.getElementById('r_watermark');
  const isDup=document.getElementById('opt_duplicate').checked;
  const isPaid=document.getElementById('opt_watermark').checked;
  wm.style.display=(isDup||isPaid)?'block':'none';
  wm.textContent=isDup?'DUPLICATE':'PAID';

  // QR
  const qrc=document.getElementById('qr-container');
  qrc.innerHTML='';
  if(document.getElementById('opt_qr').checked&&name){
    try{
      new QRCode(qrc,{text:'Receipt:'+receiptNo+' | '+name+' | '+fmtFull(grandTotal)+' | '+dateStr,width:60,height:60,correctLevel:QRCode.CorrectLevel.L});
    }catch(e){}
  }

  // Scale after paint — avoids layout thrash on every keystroke
  requestAnimationFrame(scaleReceipt);
}

/** Shows/hides the Cash+UPI split amount inputs depending on whether Split mode is
 * selected, then re-renders the receipt. */
function toggleSplitFields(){
  const show=getMode()==='split';
  document.getElementById('splitFields').style.display=show?'block':'none';
  renderReceipt();
}

/** Debounced (200ms) live-search dropdown under the student name field — matches the first
 * 5 students whose name contains the typed text. */
function studentAutocomplete(val){
  clearTimeout(autoTimeout);
  const dd=document.getElementById('studentDropdown');
  if(!val||val.length<2){ dd.innerHTML=''; return; }
  autoTimeout=setTimeout(()=>{
    const students=DB.get('mv_students',[]);
    const matches=students.filter(s=>s.name.toLowerCase().includes(val.toLowerCase())).slice(0,5);
    if(!matches.length){ dd.innerHTML=''; return; }
    let h='<div style="position:absolute;top:0;left:0;right:0;background:#fff;border:1.5px solid var(--blue);border-radius:8px;z-index:100;box-shadow:0 4px 20px rgba(0,0,0,.15);">';
    matches.forEach(s=>{
      h+='<div onclick="fillStudentData(\''+s.id+'\')" style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);" onmouseover="this.style.background=\'var(--blue-light)\'" onmouseout="this.style.background=\'#fff\'">';
      h+='<strong>'+s.name+'</strong> <span style="color:var(--muted);font-size:11px;">'+s.regNo+'</span></div>';
    });
    h+='</div>';
    dd.innerHTML=h;
  },200);
}
/** Fills the receipt form's name/reg no/course/batch fields from an existing student
 * record and re-renders the preview. */
function fillStudentData(id){
  const students=DB.get('mv_students',[]);
  const s=students.find(x=>x.id===id);
  if(!s)return;
  const courses=DB.get('mv_courses',[]);
  const course=courses.find(c=>c.id===s.courseId);
  document.getElementById('f_name').value=s.name;
  document.getElementById('f_regNo').value=s.regNo||'';
  document.getElementById('f_program').value=course?course.name:'';
  document.getElementById('f_batch').value=s.batch||'';
  document.getElementById('studentDropdown').innerHTML='';
  renderReceipt();
}

/** Resets every receipt form field to blank/default, restores UPI as the payment mode,
 * re-generates the next auto receipt number, and re-renders. */
function clearReceiptForm(){
  ['f_receiptNo','f_date','f_regNo','f_program','f_invNo','f_batch','f_invDate',
   'f_name','f_admFee','f_regFee','f_initPay','f_instPay','f_upiId','f_special',
   'f_chequeNo','f_chequeDate','f_drawn','f_nid','f_nim','f_niy','f_splitCash','f_splitUpi',
   'f_totalCourseFee']
  .forEach(id=>{ const e=document.getElementById(id); if(e)e.value=''; });
  document.getElementById('mode_upi').checked=true;
  document.getElementById('splitFields').style.display='none';
  document.getElementById('opt_qr').checked=false;
  document.getElementById('opt_watermark').checked=false;
  document.getElementById('opt_duplicate').checked=false;
  setAutoReceiptNo();
  renderReceipt();
}

/** Writes the next receipt number (prefix + zero-padded counter, both from settings) into
 * the form, and defaults today's date into the date fields if they're empty. */
function setAutoReceiptNo(){
  const s=DB.get('mv_settings',{});
  const counter=s.receiptCounter||1;
  const prefix=s.receiptPrefix||'';
  document.getElementById('f_receiptNo').value=prefix+String(counter).padStart(4,'0');
  const el=document.getElementById('f_date'); if(el&&!el.value) el.value=today();
  const el2=document.getElementById('f_invDate'); if(el2&&!el2.value) el2.value=today();
}

// ══════════════════════════════════════════
//  SAVE RECEIPT TO HISTORY
// ══════════════════════════════════════════
/** Validates the form (name + grand total > 0), builds a receipt record and prepends it to
 * history, credits the matching student's feesPaid if one exists, and increments the
 * settings receipt counter for next time. */
function saveReceiptToHistory(){
  const name=gv('f_name');
  if(!name){ showToast('Please enter student name','error'); return; }
  const admFee=parseFloat(gv('f_admFee'))||0,regFee=parseFloat(gv('f_regFee'))||0;
  const initPay=parseFloat(gv('f_initPay'))||0,instPay=parseFloat(gv('f_instPay'))||0;
  const special=parseFloat(gv('f_special'))||0;
  const subTotal=admFee+regFee+initPay+instPay;
  const grandTotal=subTotal-special;
  if(grandTotal<=0){ showToast('Grand Total must be greater than 0','error'); return; }

  const receipt={
    id:uuid(), receiptNo:gv('f_receiptNo'), date:gv('f_date'),
    studentName:name, regNo:gv('f_regNo'), program:gv('f_program'),
    batch:gv('f_batch'), invNo:gv('f_invNo'), invDate:gv('f_invDate'),
    admFee,regFee,initPay,instPay,special,upiId:gv('f_upiId'),
    paymentMode:getMode(),
    splitCash:parseFloat(gv('f_splitCash'))||0,
    splitUpi:parseFloat(gv('f_splitUpi'))||0,
    chequeNo:gv('f_chequeNo'),chequeDate:gv('f_chequeDate'),drawn:gv('f_drawn'),
    nextInstDate:gv('f_nid'),nextInstMonth:gv('f_nim'),nextInstYear:gv('f_niy'),
    grandTotal,subTotal,status:'active',isDuplicate:document.getElementById('opt_duplicate').checked,
    createdAt:Date.now()
  };

  // Save receipt
  const receipts=DB.get('mv_receipts',[]);
  receipts.unshift(receipt);
  DB.set('mv_receipts',receipts);

  // Update student fees if matched — and optionally create/refresh the student record
  // from the "Total Course Fee" field so this student becomes trackable on the Dues page
  // even if nobody ever added them through the Students form.
  const totalCourseFee=parseFloat(gv('f_totalCourseFee'))||0;
  const students=DB.get('mv_students',[]);
  const si=students.findIndex(s=>s.name.toLowerCase()===name.toLowerCase());

  // If a next-instalment date was filled in on the receipt, build a YYYY-MM-DD string
  // (the format the Fee Schedule / Dues badge code expects) for the remaining balance.
  const nid=gv('f_nid'), nim=gv('f_nim'), niy=gv('f_niy');
  const nextInstDueDate=(nid&&nim&&niy)?`20${niy.padStart(2,'0')}-${nim.padStart(2,'0')}-${nid.padStart(2,'0')}`:'';

  if(si>=0){
    students[si].feesPaid=(students[si].feesPaid||0)+grandTotal;
    if(totalCourseFee>0) students[si].totalFee=totalCourseFee; // lets a re-entered figure correct the one on file
    addOrUpdatePendingInstalment(students[si], nextInstDueDate);
    DB.set('mv_students',students);
  } else if(totalCourseFee>0){
    // No student record exists yet — auto-create a minimal one so this receipt's remaining
    // balance shows up in Fee Dues going forward, without requiring a trip to the Students page.
    const courses=DB.get('mv_courses',[]);
    const matchedCourse=courses.find(c=>c.name&&c.name.toLowerCase()===(gv('f_program')||'').toLowerCase());
    const newStudent={
      id:uuid(), name, regNo:gv('f_regNo'), courseId:matchedCourse?matchedCourse.id:null,
      batch:gv('f_batch'), totalFee:totalCourseFee, feesPaid:grandTotal,
      courseStatus:'ongoing', instalments:[], createdAt:Date.now()
    };
    addOrUpdatePendingInstalment(newStudent, nextInstDueDate);
    students.push(newStudent);
    DB.set('mv_students',students);
  }

  // Increment counter
  const settings=DB.get('mv_settings',{});
  settings.receiptCounter=(settings.receiptCounter||1)+1;
  DB.set('mv_settings',settings);

  showToast('✅ Receipt issued & saved successfully!','success');
  updateDuesBadge();
  populateStudentSelect();
}

// ══════════════════════════════════════════
//  SHARED CANVAS CAPTURE
// ══════════════════════════════════════════
/** Shared image-capture routine used by Save Image / Save PDF / Save 2xPDF: clones the
 * receipt DOM off-screen (avoiding transform/visibility issues with the live preview),
 * copies canvas content (QR code) across, waits for images to load, then rasterises it
 * with html2canvas. Returns {imgData, canvas, imgType}, using PNG normally and JPEG for
 * very large captures to keep file size sane. */
async function captureReceiptCanvas(){
  const receipt=document.getElementById('receipt-paper');
  if(!receipt) throw new Error('Receipt element not found.');

  // ── Clone receipt into an off-screen container ──
  // This avoids ALL issues with hidden panels, transforms, display:none parents.
  // The clone is always fully visible and measurable.
  const clone = receipt.cloneNode(true);
  clone.style.cssText = [
    'position:fixed',
    'top:-9999px',
    'left:-9999px',
    'width:559px',
    'min-height:794px',
    'background:#ffffff',
    'box-shadow:none',
    'border-radius:0',
    'transform:none',
    'visibility:visible',
    'display:block',
    'z-index:-1',
    'padding:26px 32px',
    'box-sizing:border-box',
    'font-family:Times New Roman,Times,serif',
    'color:#111',
    'font-size:11px'
  ].join(';');

  document.body.appendChild(clone);

  // ── Copy any canvas elements (e.g. QR code) from original to clone ──
  const origCanvases = receipt.querySelectorAll('canvas');
  const cloneCanvases = clone.querySelectorAll('canvas');
  origCanvases.forEach((oc,i)=>{
    if(cloneCanvases[i]){
      const ctx = cloneCanvases[i].getContext('2d');
      cloneCanvases[i].width = oc.width;
      cloneCanvases[i].height = oc.height;
      ctx.drawImage(oc,0,0);
    }
  });

  // ── Wait for images in clone to load ──
  const images = [...clone.querySelectorAll('img')].filter(i=>i.src);
  await Promise.all(images.map(img=>new Promise(res=>{
    if(img.complete && img.naturalWidth>0){ res(); return; }
    img.onload = res;
    img.onerror = res;
    setTimeout(res, 3000);
  })));

  // ── Wait two frames for layout to settle ──
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const naturalW = clone.offsetWidth || 559;
  const naturalH = clone.offsetHeight || 794;

  // ── Capture ──
  let canvas;
  try {
    canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      removeContainer: false,
      imageTimeout: 8000,
      width: naturalW,
      height: naturalH,
      x: 0,
      y: 0,
    });
  } finally {
    document.body.removeChild(clone);
  }

  if(!canvas || canvas.width < 10 || canvas.height < 10){
    throw new Error('Capture failed — canvas was empty. Please try again.');
  }

  // ── Export: PNG for normal size, JPEG for very large ──
  const pixelCount = canvas.width * canvas.height;
  const imgData = pixelCount > 4000000
    ? canvas.toDataURL('image/jpeg', 0.95)
    : canvas.toDataURL('image/png');

  if(!imgData || imgData === 'data:,' || imgData.length < 1000){
    throw new Error('Image export failed. Receipt may be empty.');
  }

  const imgType = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  return { imgData, canvas, imgType };
}

// ══════════════════════════════════════════
//  PDF FILENAME HELPER
// ══════════════════════════════════════════
/** Builds a descriptive download filename from the student name, formatted date, and
 * whether the receipt has a discount and/or an outstanding instalment (e.g.
 * 'Name_dd-mm-yyyy_receipt special-due.pdf'). */
function buildPdfFilename(prefix){
  const name=(gv('f_name')||'Receipt').trim().replace(/\s+/g,'_');
  // Format date as dd-mm-yyyy
  const raw=gv('f_date')||'';
  let datePart='';
  if(raw){
    // Handle both dd/mm/yyyy and yyyy-mm-dd formats
    if(raw.includes('/')){
      datePart=raw.replace(/\//g,'-'); // already dd-mm-yyyy
    } else if(raw.includes('-')&&raw.length===10){
      const p=raw.split('-');
      if(p[0].length===4){ datePart=p[2]+'-'+p[1]+'-'+p[0]; }
      else { datePart=raw; }
    } else { datePart=raw; }
  }
  const special=parseFloat(gv('f_special'))||0;
  const instPay=parseFloat(gv('f_instPay'))||0;
  const nid=gv('f_nid')||'';
  const hasDue=(instPay>0)||(nid.trim()!=='');
  const hasDiscount=special>0;
  let suffix='receipt';
  if(hasDiscount&&hasDue) suffix='receipt special-due';
  else if(hasDiscount) suffix='receipt special';
  const base=name+'_'+datePart+'_'+suffix;
  return (prefix?prefix+'_':'')+base+'.pdf';
}

// ══════════════════════════════════════════
//  SAVE AS IMAGE
// ══════════════════════════════════════════
/** Captures the receipt as a canvas and downloads it as a PNG, reusing the PDF filename
 * logic with the extension swapped. */
async function saveAsImage(){
  const btn=document.getElementById('img-btn')||document.getElementById('img-btn-mob');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Saving...'; }
  showToast('⏳ Generating image...');
  try{
    const {imgData,canvas}=await captureReceiptCanvas();
    const link=document.createElement('a');
    // Use same filename logic as PDF — just swap .pdf → .png
    link.download=buildPdfFilename('').replace(/\.pdf$/,'.png');
    link.href=canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ Image saved!','success');
  }catch(err){ showToast('❌ '+err.message,'error'); console.error(err); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='🖼️ Save Image'; } }
}

// ══════════════════════════════════════════
//  SAVE 2x PDF — landscape A4, two receipts side by side
// ══════════════════════════════════════════
/** Builds a landscape A4 PDF with two copies of the receipt side-by-side (with a dashed
 * cut line between them) — handy for printing office + student copies on one sheet. */
async function save2PDF(){
  const btn=document.getElementById('save2pdf-btn');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Generating...'; }
  showToast('⏳ Building 2-copy PDF...');
  try{
    const {imgData,canvas,imgType}=await captureReceiptCanvas();
    const {jsPDF}=window.jspdf;

    // Landscape A4: 297mm wide × 210mm tall
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const pageW=pdf.internal.pageSize.getWidth();   // 297
    const pageH=pdf.internal.pageSize.getHeight();  // 210

    const margin=8;
    const gap=6;  // gap between the two receipts

    // Each receipt occupies half the page width minus margins and half the gap
    const slotW=(pageW - margin*2 - gap) / 2;
    const slotH=pageH - margin*2;

    // Scale receipt to fit inside its slot, preserving aspect ratio
    const aspect=canvas.height/canvas.width;  // receipt is taller than wide
    let drawW=slotW;
    let drawH=drawW*aspect;
    if(drawH>slotH){ drawH=slotH; drawW=drawH/aspect; }

    // Centre each receipt vertically within the slot
    const yOffset=margin+((slotH-drawH)/2);

    // Left copy
    const x1=margin+((slotW-drawW)/2);
    pdf.addImage(imgData,imgType,x1,yOffset,drawW,drawH);

    // Dashed vertical cut line in the middle
    const midX=margin+slotW+(gap/2);
    pdf.setDrawColor(160,160,160);
    pdf.setLineDashPattern([3,2],0);
    pdf.line(midX,margin,midX,pageH-margin);
    pdf.setFontSize(7);
    pdf.setTextColor(150,150,150);
    pdf.text('✂  cut',midX,pageH/2,{align:'center'});

    // Right copy
    const x2=margin+slotW+gap+((slotW-drawW)/2);
    pdf.addImage(imgData,imgType,x2,yOffset,drawW,drawH);

    pdf.save(buildPdfFilename('2x'));
    showToast('✅ 2-copy PDF saved!','success');
  }catch(err){ showToast('❌ '+err.message,'error'); console.error(err); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='📑 Save2PDF'; } }
}

// ══════════════════════════════════════════
//  SHARE
// ══════════════════════════════════════════
/** Opens WhatsApp with a pre-filled payment-confirmation message built from the current
 * (unsaved) form values. */
function shareWhatsApp(){
  const name=gv('f_name')||'Student';
  const admFee=parseFloat(gv('f_admFee'))||0,regFee=parseFloat(gv('f_regFee'))||0;
  const initPay=parseFloat(gv('f_initPay'))||0,instPay=parseFloat(gv('f_instPay'))||0;
  const special=parseFloat(gv('f_special'))||0;
  const grandTotal=admFee+regFee+initPay+instPay-special;
  const s=DB.get('mv_settings',{});
  const msg='*'+( s.instituteName||'MICROVISION')+'*\n'+(s.instituteSubtitle||'Advanced Technology Institute')+'\n\n'+
    '📄 Receipt No.: '+gv('f_receiptNo')+'\n📅 Date: '+gv('f_date')+'\n👤 Name: '+name+'\n📚 Course: '+gv('f_program')+
    '\n💰 Amount Paid: ₹'+grandTotal.toLocaleString('en-IN')+'\n💳 Mode: '+getMode().toUpperCase()+
    '\n\nThank you for your payment! 🙏';
  window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(msg),'_blank');
}
/** Opens the default mail client with a pre-filled receipt-confirmation subject/body built
 * from the current form values. */
function shareEmail(){
  const name=gv('f_name')||'Student';
  const admFee=parseFloat(gv('f_admFee'))||0,regFee=parseFloat(gv('f_regFee'))||0;
  const initPay=parseFloat(gv('f_initPay'))||0,instPay=parseFloat(gv('f_instPay'))||0;
  const special=parseFloat(gv('f_special'))||0;
  const grandTotal=admFee+regFee+initPay+instPay-special;
  const s=DB.get('mv_settings',{});
  const sub=encodeURIComponent('Fee Receipt - '+(s.instituteName||'Microvision')+' - '+name);
  const body=encodeURIComponent('Dear '+name+',\n\nPlease find your fee receipt details below:\n\nReceipt No.: '+gv('f_receiptNo')+'\nDate: '+gv('f_date')+'\nCourse: '+gv('f_program')+'\nAmount Paid: ₹'+grandTotal.toLocaleString('en-IN')+'\nPayment Mode: '+getMode().toUpperCase()+'\n\nThank you,\n'+(s.instituteName||'Microvision'));
  window.location.href='mailto:?subject='+sub+'&body='+body;
}
// ══════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════
/** Renders the Receipt History list, applying the search/payment-mode/status filters, with
 * View and Delete actions per card and a void/active status badge. */
function renderHistory(filter){
  let receipts=DB.get('mv_receipts',[]);
  const search=document.getElementById('histSearch')?.value||'';
  const mode=document.getElementById('histMode')?.value||'';
  const status=document.getElementById('histStatus')?.value||'';
  if(search) receipts=receipts.filter(r=>r.studentName.toLowerCase().includes(search.toLowerCase())||r.receiptNo.includes(search));
  if(mode) receipts=receipts.filter(r=>r.paymentMode===mode);
  if(status) receipts=receipts.filter(r=>r.status===status);
  const el=document.getElementById('historyList');
  if(!receipts.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">🗂️</div><div class="empty-text">No receipts found</div><div class="empty-sub">Save your first receipt to see it here</div></div>';
    return;
  }
  el.innerHTML=receipts.map(r=>`
    <div class="receipt-card ${r.status==='void'?'voided':''}" onclick="viewReceipt('${r.id}')">
      <div class="receipt-info">
        <div class="receipt-num">#${r.receiptNo} ${r.isDuplicate?'<span class="badge badge-orange">DUPLICATE</span>':''}</div>
        <div class="receipt-meta">${r.studentName} • ${r.program||'-'} • ${r.date} • <span class="badge badge-blue">${r.paymentMode.toUpperCase()}</span></div>
      </div>
      <div style="text-align:right;">
        <div class="receipt-amount">${fmtFull(r.grandTotal)}</div>
        <span class="badge ${r.status==='active'?'badge-green':'badge-red'}">${r.status}</span>
        <div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;">
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();viewReceipt('${r.id}')">👁 View</button>
          <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();deleteReceiptById('${r.id}')">🗑 Delete</button>
        </div>
      </div>
    </div>`).join('');
}
/** Re-runs renderHistory() — wired to the History page's filter inputs' onchange. */
function filterHistory(){ renderHistory(); }

/** Opens the read-only receipt detail modal for a given receipt id, showing its Grand
 * Total prominently and the Void button only if it's still active. */
function viewReceipt(id){
  viewingReceiptId=id;
  const receipts=DB.get('mv_receipts',[]);
  const r=receipts.find(x=>x.id===id);
  if(!r)return;
  const body=document.getElementById('receiptViewBody');
  body.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${detRow('Receipt No.',r.receiptNo)}${detRow('Date',r.date)}
      ${detRow('Student',r.studentName)}${detRow('Reg. No.',r.regNo||'-')}
      ${detRow('Course',r.program||'-')}${detRow('Batch',r.batch||'-')}
      ${detRow('Adm Fee',fmtFull(r.admFee))}${detRow('Reg Fee',fmtFull(r.regFee))}
      ${detRow('Initial Pay',fmtFull(r.initPay))}${detRow('Instalment',fmtFull(r.instPay))}
      ${detRow('Special (−)',fmtFull(r.special))}${detRow('Mode',r.paymentMode.toUpperCase())}
    </div>
    <div style="margin-top:16px;background:var(--green-light);border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:13px;color:var(--muted);">Grand Total</div>
      <div style="font-size:28px;font-weight:800;color:var(--green);">${fmtFull(r.grandTotal)}</div>
    </div>`;
  document.getElementById('voidBtn').style.display=r.status==='active'?'inline-flex':'none';
  openModal('receiptViewModal');
}
/** Small template helper: one labeled value box in the receipt detail modal's grid. */
function detRow(label,value){
  return `<div style="background:var(--bg);border-radius:8px;padding:10px 14px;">
    <div style="font-size:11px;color:var(--muted);font-weight:600;">${label}</div>
    <div style="font-size:14px;font-weight:700;margin-top:2px;">${value}</div></div>`;
}
/** Marks the currently-viewed receipt as void (after confirmation) — keeps it in history
 * for records but flags it as no longer active. */
function voidCurrentReceipt(){
  if(!viewingReceiptId)return;
  if(!confirm('Void this receipt? This cannot be undone.'))return;
  const receipts=DB.get('mv_receipts',[]);
  const i=receipts.findIndex(r=>r.id===viewingReceiptId);
  if(i>=0){ receipts[i].status='void'; DB.set('mv_receipts',receipts); }
  closeModal('receiptViewModal');
  renderHistory();
  showToast('Receipt voided','success');
}
/** Loads the currently-viewed receipt's data back into the live receipt form (marked as
 * Duplicate) and jumps to the receipt page so it can be reprinted. */
function reprintReceipt(){
  if(!viewingReceiptId)return;
  const receipts=DB.get('mv_receipts',[]);
  const r=receipts.find(x=>x.id===viewingReceiptId);
  if(!r)return;
  closeModal('receiptViewModal');
  loadReceiptIntoForm(r);
  navigate('receipt');
}
/** Populates every receipt form field from a saved receipt record — used by
 * reprintReceipt(). */
function loadReceiptIntoForm(r){
  const setV=(id,v)=>{ const e=document.getElementById(id); if(e)e.value=v||''; };
  setV('f_receiptNo',r.receiptNo); setV('f_date',r.date); setV('f_name',r.studentName);
  setV('f_regNo',r.regNo); setV('f_program',r.program); setV('f_batch',r.batch);
  setV('f_invNo',r.invNo); setV('f_invDate',r.invDate);
  setV('f_admFee',r.admFee||0); setV('f_regFee',r.regFee||0);
  setV('f_initPay',r.initPay||0); setV('f_instPay',r.instPay||0);
  setV('f_special',r.special||0); setV('f_upiId',r.upiId);
  setV('f_chequeNo',r.chequeNo); setV('f_chequeDate',r.chequeDate); setV('f_drawn',r.drawn);
  setV('f_nid',r.nextInstDate); setV('f_nim',r.nextInstMonth); setV('f_niy',r.nextInstYear);
  const modeEl=document.getElementById('mode_'+r.paymentMode);
  if(modeEl){ modeEl.checked=true; }
  document.getElementById('opt_duplicate').checked=true;
  toggleSplitFields();
  renderReceipt();
}
/** Exports the full receipt history to an .xlsx spreadsheet via SheetJS. */
function exportReceiptsExcel(){
  const receipts=DB.get('mv_receipts',[]);
  if(!receipts.length){ showToast('No receipts to export','error'); return; }
  const data=receipts.map(r=>({
    'Receipt No.':r.receiptNo,'Date':r.date,'Student':r.studentName,'Reg No':r.regNo,
    'Course':r.program,'Batch':r.batch,'Adm Fee':r.admFee,'Reg Fee':r.regFee,
    'Initial Pay':r.initPay,'Instalment':r.instPay,'Special':r.special,
    'Grand Total':r.grandTotal,'Mode':r.paymentMode,'Status':r.status
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Receipts');
  XLSX.writeFile(wb,'Microvision_Receipts_'+new Date().toLocaleDateString('en-IN').replace(/\//g,'-')+'.xlsx');
  showToast('Excel exported!','success');
}

// ══════════════════════════════════════════
//  STUDENTS
// ══════════════════════════════════════════
/** Jumps straight to a pre-filled receipt for a given student. If called from a page that
 * doesn't have the receipt form (e.g. the notification panel on another page), stashes the
 * student id in sessionStorage and redirects to receipts.html, which picks it up in
 * PAGE_READY. */
/** Ensures a student has exactly one instalment row representing their remaining balance
 * (any still-pending rows are replaced, not stacked) with the given due date, if there's
 * still money owed after this payment. Used by saveReceiptToHistory() so receipt-only
 * students still get a due-date the Dues page's days-remaining badge can read. */
function addOrUpdatePendingInstalment(student, dueDate){
  const remaining=(student.totalFee||0)-(student.feesPaid||0);
  student.instalments=(student.instalments||[]).filter(i=>i.status==='paid'); // keep paid history, drop old pending rows
  if(remaining>0 && dueDate){
    student.instalments.push({dueDate, amount:remaining, status:'pending'});
  }
}

function quickReceipt(id){
  if(!document.getElementById('page-receipt')){
    // We're on another page (e.g. notification panel) — hand off via sessionStorage
    sessionStorage.setItem('mv_pending_fill', id);
    location.href='receipts.html';
    return;
  }
  fillStudentData(id); navigate('receipt');
}

// Runs after shared initApp()'s deferred phase, only on receipts.html (PAGE_READY hook).
/** Runs after shared.js's initApp() deferred phase, only on receipts.html: sets the next
 * receipt number and today's date, restores the saved stamp preview, renders the receipt,
 * and — if a student was handed off from another page's notification panel — fills their
 * data in. */
function PAGE_READY(s){
  setAutoReceiptNo();
  const el=document.getElementById('f_date'); if(el&&!el.value) el.value=today();
  const el2=document.getElementById('f_invDate'); if(el2&&!el2.value) el2.value=today();
  if(s.stampBase64){
    const prev=document.getElementById('stampImgPreviewInline');
    const ph=document.getElementById('stampPlaceholderInline');
    const btn=document.getElementById('stampRemoveBtnInline');
    if(prev){ prev.src=s.stampBase64; prev.style.display='block'; }
    if(ph) ph.style.display='none';
    if(btn) btn.style.display='inline-flex';
  }
  renderReceipt();
  requestAnimationFrame(()=>{ setTimeout(scaleReceipt,50); });
  // Handle a student handed off from another page's notification panel
  const pending=sessionStorage.getItem('mv_pending_fill');
  if(pending){
    sessionStorage.removeItem('mv_pending_fill');
    fillStudentData(pending);
  }
}

// ══════════════════════════════════════════
//  COURSES
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  ATTENDANCE
// ══════════════════════════════════════════
/** Shrinks the fixed-559px receipt preview to fit the available panel width (mobile/narrow
 * screens), preserving aspect ratio, and expands the wrapper's min-height to match so
 * nothing gets clipped. */
function scaleReceipt(){
  const scaler=document.getElementById('receiptScaler');
  const wrap=document.querySelector('.preview-wrap');
  if(!scaler||!wrap)return;
  const padding=32;
  const available=wrap.clientWidth-padding;
  const scale=available<559?(available/559):1;
  scaler.style.transform='scale('+scale+')';
  scaler.style.transformOrigin='top center';
  scaler.style.width='559px';
  scaler.style.display='block';
  const paper=document.getElementById('receipt-paper');
  if(paper){
    const scaledH=paper.offsetHeight*scale;
    wrap.style.minHeight=(scaledH+32)+'px';
  }
}
window.addEventListener('resize',()=>{
  // On desktop: always show both receipt panels
  if(window.innerWidth>768){
    const fp=document.querySelector('.receipt-form-panel');
    const pp=document.querySelector('.receipt-preview-panel');
    if(fp) fp.style.display='';
    if(pp) pp.style.display='';
  }
  scaleReceipt();
});

// ══════════════════════════════════════════
//  RECEIPT MOBILE TAB SWITCHER
// ══════════════════════════════════════════
/** Mobile-only Form/Preview tab switcher for the receipt page (desktop shows both panels
 * side by side at all times). */
function switchReceiptTab(tab){
  const formPanel=document.querySelector('.receipt-form-panel');
  const previewPanel=document.querySelector('.receipt-preview-panel');
  const tabForm=document.getElementById('tab-form');
  const tabPreview=document.getElementById('tab-preview');
  if(!formPanel||!previewPanel)return;
  if(tab==='form'){
    formPanel.style.display='';
    previewPanel.style.display='none';
    tabForm.classList.add('active');
    tabPreview.classList.remove('active');
  } else {
    formPanel.style.display='none';
    previewPanel.style.display='';
    tabPreview.classList.add('active');
    tabForm.classList.remove('active');
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ scaleReceipt(); }); });
  }
}
// Resize is handled by the single listener in scaleReceipt above

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
