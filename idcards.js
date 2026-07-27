let idCardStudentId=null;
/** Renders the searchable student picker list on the left of the ID Cards page. */
function renderIdCardList(search=''){
  const students=DB.get('mv_students',[]);
  let filtered=students;
  if(search) filtered=students.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())||s.regNo?.includes(search));
  const el=document.getElementById('idCardStudentList');
  if(!filtered.length){
    el.innerHTML='<div style="text-align:center;padding:24px;color:var(--muted);">No students found.</div>';
    return;
  }
  el.innerHTML=filtered.map(s=>`
    <div onclick="selectIdCardStudent('${s.id}')" style="padding:12px 18px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:12px;transition:.15s;" onmouseover="this.style.background='var(--blue-light)'" onmouseout="this.style.background=''">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--bg);border:1.5px solid var(--border);overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${s.photo?`<img src="${s.photo}" style="width:36px;height:36px;object-fit:cover;border-radius:50%;" alt=""/>`:`<span style="font-size:15px;font-weight:700;color:var(--muted);">${s.name.charAt(0)}</span>`}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;">${s.name}</div>
        <div style="font-size:11px;color:var(--muted);">${s.regNo||''} ${s.batch?'• '+s.batch:''}</div>
      </div>
    </div>`).join('');
}

/** Shows a live ID card preview for the clicked student, with buttons to open the
 * full-size modal, download as PDF, or print. */
function selectIdCardStudent(id){
  idCardStudentId=id;
  const s=DB.get('mv_students',[]).find(x=>x.id===id);
  if(!s) return;
  const inst=DB.get('mv_settings',{});
  const courses=DB.get('mv_courses',[]);
  const course=courses.find(c=>c.id===s.courseId);

  const cardHtml=buildIDCardHTML(s,inst,course);
  document.getElementById('idCardPreviewCol').innerHTML=`
    <div id="idCardPreviewLive" style="display:flex;flex-direction:column;align-items:center;gap:14px;">
      ${cardHtml}
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        <button class="btn btn-primary" onclick="openIDCardModal('${id}')">🔍 Full Preview</button>
        <button class="btn btn-success" onclick="idCardStudentId='${id}';downloadIDCardPDF()">📄 Download PDF</button>
        <button class="btn btn-outline" onclick="idCardStudentId='${id}';printIDCard()">🖨️ Print</button>
      </div>
    </div>`;
}

/** Builds the actual ID card markup (logo, institute name, photo,
 * name/reg/course/batch/DOB/phone, validity year range, QR placeholder) — shared by the
 * live preview, the modal, and printing. */
function buildIDCardHTML(s, inst, course){
  const logoHtml=inst.logoBase64?`<img src="${inst.logoBase64}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;"/>`:
    `<span style="font-size:18px">🎓</span>`;
  const photoHtml=s.photo?`<img src="${s.photo}" style="width:64px;height:78px;object-fit:cover;border-radius:6px;" alt=""/>`:
    `<span style="font-size:28px;color:rgba(255,255,255,.6);">👤</span>`;
  const joinYear=s.startDate?new Date(s.startDate).getFullYear():new Date().getFullYear();
  const validYear=joinYear+1;

  return `<div class="id-card" id="idCardFront" style="width:320px;">
    <div class="id-card-header">
      <div class="id-card-logo">${logoHtml}</div>
      <div>
        <div class="id-card-inst">${inst.instituteName||'MICROVISION'}<br><small>${inst.instituteSubtitle||'Advanced Technology Institute'}</small></div>
      </div>
    </div>
    <div class="id-card-body">
      <div class="id-card-photo">${photoHtml}</div>
      <div class="id-card-details">
        <div class="id-card-name">${s.name}</div>
        <div class="id-card-row"><strong>Reg:</strong>${s.regNo||'—'}</div>
        <div class="id-card-row"><strong>Course:</strong>${course?course.name:s.batchCode||'—'}</div>
        <div class="id-card-row"><strong>Batch:</strong>${s.batch||'—'}</div>
        <div class="id-card-row"><strong>DOB:</strong>${s.dob||'—'}</div>
        <div class="id-card-row"><strong>Phone:</strong>${s.phone||'—'}</div>
      </div>
    </div>
    <div class="id-card-footer">
      <div class="id-card-validity">Valid: ${joinYear}–${validYear}<br><span style="opacity:.6;font-size:8px;">${inst.instituteAddress||''}</span></div>
      <div class="id-card-qr" id="idCardQR_${s.id}"></div>
    </div>
  </div>`;
}

/** Opens the full-size ID card modal for a student and renders its QR code (reg no + name)
 * once the modal has painted. */
function openIDCardModal(id){
  idCardStudentId=id;
  const s=DB.get('mv_students',[]).find(x=>x.id===id);
  if(!s)return;
  const inst=DB.get('mv_settings',{});
  const courses=DB.get('mv_courses',[]);
  const course=courses.find(c=>c.id===s.courseId);
  const body=document.getElementById('idCardModalBody');
  body.innerHTML=buildIDCardHTML(s,inst,course);
  openModal('idCardModal');
  // Render QR after modal opens
  requestAnimationFrame(()=>{
    const qrEl=document.getElementById('idCardQR_'+s.id);
    if(qrEl&&s.regNo){
      try{ qrEl.innerHTML=''; new QRCode(qrEl,{text:s.regNo+'|'+s.name,width:40,height:40,correctLevel:QRCode.CorrectLevel.L}); }catch(e){}
    }
  });
}

/** Captures the currently-shown ID card as a canvas and saves it as a credit-card-sized
 * (85×55mm) landscape PDF. If the card isn't in the DOM yet (modal not open), opens it
 * first and retries shortly after. */
async function downloadIDCardPDF(){
  const id=idCardStudentId; if(!id){ showToast('Select a student first','error'); return; }
  const cardEl=document.getElementById('idCardFront');
  if(!cardEl){ openIDCardModal(id); setTimeout(downloadIDCardPDF,600); return; }
  showToast('⏳ Generating ID card PDF...');
  try{
    const canvas=await html2canvas(cardEl,{scale:3,useCORS:true,backgroundColor:null,logging:false});
    const imgData=canvas.toDataURL('image/png');
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:[85,55]});
    pdf.addImage(imgData,'PNG',0,0,85,55);
    const s=DB.get('mv_students',[]).find(x=>x.id===id);
    pdf.save((s?s.name.replace(/\s+/g,'_'):'IDCard')+'_ID.pdf');
    showToast('✅ ID Card PDF saved!','success');
  }catch(e){ showToast('❌ '+e.message,'error'); }
}

/** Opens a popup window sized for an 85×55mm card, injects the page's own <style> tags
 * plus print-specific sizing, and auto-triggers the print dialog. */
function printIDCard(){
  const id=idCardStudentId; if(!id){ showToast('Select a student first','error'); return; }
  const s=DB.get('mv_students',[]).find(x=>x.id===id);
  const inst=DB.get('mv_settings',{});
  const courses=DB.get('mv_courses',[]);
  const course=courses.find(c=>c.id===s?.courseId);
  const cardHtml=buildIDCardHTML(s||{name:'',id:''},inst,course);
  let styles='';
  document.querySelectorAll('style').forEach(st=>{ styles+=st.outerHTML; });
  const printHTML=`<!DOCTYPE html><html><head><meta charset="UTF-8"/>${styles}<style>
    @page{size:85mm 55mm;margin:0}body{background:#fff;display:flex;align-items:center;justify-content:center;width:85mm;height:55mm;overflow:hidden;}
    .id-card{width:85mm!important;min-height:55mm!important;border-radius:0!important;}
  </style></head><body>${cardHtml}<script>window.onload=function(){setTimeout(()=>{window.print();},600);}<\/script></body></html>`;
  const win=window.open('','_blank','width=400,height=300');
  if(win){ win.document.open(); win.document.write(printHTML); win.document.close(); }
  else showToast('⚠️ Allow popups to print');
}

// ══════════════════════════════════════════
//  SCALE RECEIPT
// ══════════════════════════════════════════
