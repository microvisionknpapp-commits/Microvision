let editingCourseId=null;
let stuStatusFilter='ongoing';
let editingStudentId=null;
/** Switches the Students list filter (ongoing/completed/all), restyles the filter buttons
 * to show which is active, and re-renders the table. */
function setStuFilter(f){
  stuStatusFilter=f;
  ['ongoing','completed','all'].forEach(k=>{
    const b=document.getElementById('sfBtn-'+k);
    if(!b)return;
    if(k===f){ b.className='btn btn-primary'; b.style.cssText='font-size:12px;padding:7px 14px;'; }
    else      { b.className='btn btn-outline';  b.style.cssText='font-size:12px;padding:7px 14px;'; }
  });
  renderStudents(document.getElementById('stuSearch')?.value||'', f);
}
/** Renders the Students table: applies the status filter and any name/reg-no search, shows
 * a header count summary, and builds one row per student with a fee progress bar and
 * status-dependent action buttons (Complete/Re-enroll, Edit, Quick Receipt, ID Card,
 * Delete). */
function renderStudents(search='', filter){
  if(filter===undefined) filter=stuStatusFilter||'ongoing';
  let students=DB.get('mv_students',[]);
  // Apply status filter
  if(filter==='ongoing')   students=students.filter(s=>s.courseStatus!=='completed');
  if(filter==='completed') students=students.filter(s=>s.courseStatus==='completed');
  // Apply search
  if(search) students=students.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())||s.regNo?.includes(search));
  const total=DB.get('mv_students',[]).length;
  const ongoing=DB.get('mv_students',[]).filter(s=>s.courseStatus!=='completed').length;
  const done=total-ongoing;
  document.getElementById('studentCount').textContent=`${ongoing} ongoing · ${done} completed · ${total} total`;
  const courses=DB.get('mv_courses',[]);
  const tbody=document.getElementById('studentsTbody');
  if(!students.length){
    tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted);">${filter==='completed'?'No completed students yet.':filter==='ongoing'?'No ongoing students. All may have completed their courses.':'No students yet. Add your first student.'}</td></tr>`; return;
  }
  tbody.innerHTML=students.map(s=>{
    const isCompleted=s.courseStatus==='completed';
    const course=courses.find(c=>c.id===s.courseId);
    const total=s.totalFee||0, paid=s.feesPaid||0, due=Math.max(0,total-paid);
    const pct=total>0?Math.min(100,Math.round(paid/total*100)):0;
    const barClass=pct<40?'danger':pct<80?'warn':'';
    const photoHtml=s.photo?`<img src="${s.photo}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid var(--border);margin-right:8px;vertical-align:middle;" alt=""/>`:
      `<span style="display:inline-flex;width:32px;height:32px;border-radius:50%;background:var(--bg);border:1.5px solid var(--border);align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--muted);margin-right:8px;vertical-align:middle;">${s.name.charAt(0)}</span>`;
    const statusBadge=isCompleted
      ?`<span class="badge" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;margin-left:6px;font-size:10px;">🎓 Completed</span>`
      :`<span class="badge" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;margin-left:6px;font-size:10px;">🟢 Ongoing</span>`;
    const actionBtns=isCompleted
      ?`<button class="btn btn-ghost btn-xs" title="Re-enroll for new course" onclick="reEnrollStudent('${s.id}')" style="color:var(--blue);font-size:11px;">🔄 Re-enroll</button>
         <button class="btn btn-ghost btn-xs" onclick="editStudent('${s.id}')">✏️</button>
         <button class="btn btn-ghost btn-xs" onclick="quickReceipt('${s.id}')">🖨️</button>
         <button class="btn btn-ghost btn-xs" onclick="openIDCardModal('${s.id}')">🪪</button>
         <button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="deleteStudent('${s.id}')">🗑</button>`
      :`<button class="btn btn-ghost btn-xs" title="Mark course as completed" onclick="completeStudentCourse('${s.id}')" style="color:var(--orange);font-size:11px;">🎓 Complete</button>
         <button class="btn btn-ghost btn-xs" onclick="editStudent('${s.id}')">✏️</button>
         <button class="btn btn-ghost btn-xs" onclick="quickReceipt('${s.id}')">🖨️</button>
         <button class="btn btn-ghost btn-xs" onclick="openIDCardModal('${s.id}')">🪪</button>
         <button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="deleteStudent('${s.id}')">🗑</button>`;
    return `<tr style="${isCompleted?'opacity:.75;':''}">
      <td><div style="display:flex;align-items:center;">${photoHtml}<div><strong>${s.name}</strong>${statusBadge}</div></div></td>
      <td style="font-family:monospace">${s.regNo||'-'}</td>
      <td>${course?course.name:'-'}<br><small style="color:var(--muted)">${s.batch||''}</small></td>
      <td>${s.phone||'-'}</td>
      <td>${fmtFull(paid)}<div class="fee-bar"><div class="fee-bar-fill ${barClass}" style="width:${pct}%"></div></div><small style="color:var(--muted)">${pct}% paid</small></td>
      <td style="color:${due>0?'var(--red)':'var(--green)'}"><strong>${fmtFull(due)}</strong></td>
      <td style="white-space:nowrap;">${actionBtns}</td></tr>`;
  }).join('');
}
/** Marks a student's course as completed (after confirmation) — they drop off the Ongoing
 * list but stay in history and can be re-enrolled later. */
function completeStudentCourse(id){
  if(!confirm('Mark this student\'s course as Completed?\nThey will be removed from the Ongoing list but stay in history.\n\nYou can Re-enroll them later for a new course.')) return;
  const students=DB.get('mv_students',[]);
  const i=students.findIndex(s=>s.id===id);
  if(i<0) return;
  students[i].courseStatus='completed';
  students[i].completedAt=Date.now();
  DB.set('mv_students',students);
  showToast('🎓 Course marked as completed!','success');
  renderStudents(document.getElementById('stuSearch')?.value||'', stuStatusFilter);
  updateDuesBadge();
}
/** Re-opens a completed student's edit modal so their course/batch can be updated; saving
 * afterwards flips them back to 'ongoing' (see activateStudentAfterReenroll). */
function reEnrollStudent(id){
  const students=DB.get('mv_students',[]);
  const i=students.findIndex(s=>s.id===id);
  if(i<0) return;
  const s=students[i];
  // Open the student edit modal pre-filled — user can update course/batch then save
  // Before opening, temporarily clear courseStatus so modal shows correctly
  openStudentModal(id);
  // Show a hint toast
  showToast('📝 Update the course & batch for re-enrollment, then Save.','info');
}
/** Internal helper: flips a completed student back to 'ongoing' status and clears their
 * completedAt timestamp after a re-enrollment save. */
function activateStudentAfterReenroll(id){
  // Called internally after saving an edit on a completed student
  const students=DB.get('mv_students',[]);
  const i=students.findIndex(s=>s.id===id);
  if(i>=0 && students[i].courseStatus==='completed'){
    students[i].courseStatus='ongoing';
    delete students[i].completedAt;
    DB.set('mv_students',students);
  }
}
/** Opens the Add/Edit Student modal. With no id, resets every field to blank for a new
 * student; with an id, loads that student's saved data (including pill selections, marks,
 * photo, and instalment schedule) back into the form. */
function openStudentModal(id=null){
  editingStudentId=id;
  showStudentTab(1);
  const courses=DB.get('mv_courses',[]);
  const sel=document.getElementById('sm_course');
  sel.innerHTML='<option value="">Select Course</option>'+courses.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  const allFields=['sm_name','sm_father','sm_regNo','sm_dob','sm_phone','sm_whatsapp',
    'sm_email','sm_marital','sm_income','sm_occupation','sm_org','sm_designation',
    'sm_school','sm_yearclass','sm_reference','sm_joinDate',
    'sm_address','sm_permAddress','sm_pincode','sm_landmark',
    'sm_formNo','sm_session','sm_batchCode','sm_days','sm_slot','sm_startDate',
    'sm_totalFee','sm_faculty','sm_grade','sm_refPerson','sm_photoBase64'];
  allFields.forEach(fid=>{ const e=document.getElementById(fid); if(e)e.value=''; });
  document.querySelectorAll('input[name="sm_gender"]').forEach(r=>r.checked=false);
  resetEduPills();
  // Also reset marks table dots
  ['10th','12th','grad','pgrad'].forEach(col=>{ document.querySelectorAll('input[name="sm_marks_'+col+'"]').forEach(r=>r.checked=false); });
  document.getElementById('sm_batch').innerHTML='<option value="">Select Batch</option>';
  // Reset photo
  restoreStudentPhoto('');
  // Reset instalment schedule
  clearInstalmentSchedule();

  if(id){
    document.getElementById('stuModalTitle').textContent='Edit Student';
    const s=DB.get('mv_students',[]).find(x=>x.id===id);
    if(s){
      const sv=(sid,val)=>{ const e=document.getElementById(sid); if(e)e.value=val||''; };
      sv('sm_name',s.name);sv('sm_father',s.father);sv('sm_regNo',s.regNo);
      sv('sm_dob',s.dob);sv('sm_phone',s.phone);sv('sm_whatsapp',s.whatsapp);
      sv('sm_email',s.email);sv('sm_marital',s.marital);sv('sm_income',s.income);
      sv('sm_occupation',s.occupation);sv('sm_org',s.org);sv('sm_designation',s.designation);
      sv('sm_school',s.school);sv('sm_yearclass',s.yearClass);sv('sm_reference',s.reference);
      sv('sm_joinDate',s.joinDate);
      sv('sm_address',s.address);sv('sm_permAddress',s.permAddress);
      sv('sm_pincode',s.pincode);sv('sm_landmark',s.landmark);
      sv('sm_formNo',s.formNo);sv('sm_session',s.session);sv('sm_batchCode',s.batchCode);
      sv('sm_days',s.days);sv('sm_slot',s.slot);sv('sm_startDate',s.startDate);
      sv('sm_totalFee',s.totalFee);sv('sm_faculty',s.faculty);
      sv('sm_grade',s.grade);sv('sm_refPerson',s.refPerson);
      if(s.gender) setRadioVal('sm_gender',s.gender);
      // Restore pill selections for edu/stream/board/reference
      restoreEduPill('sm_edu', s.education);
      restoreEduPill('sm_stream', s.stream);
      restoreEduPill('sm_board', s.board);
      restoreReferencePill(s.reference);
      // Restore Other text boxes if needed
      if(s.education&&s.education.startsWith('Other: ')){ const e=document.getElementById('sm_edu_other'); if(e)e.value=s.education.replace('Other: ',''); }
      if(s.stream&&s.stream.startsWith('Other: ')){ const e=document.getElementById('sm_stream_other'); if(e)e.value=s.stream.replace('Other: ',''); }
      if(s.board&&s.board.startsWith('Other: ')){ const e=document.getElementById('sm_board_other'); if(e)e.value=s.board.replace('Other: ',''); }
      if(s.reference&&s.reference.startsWith('Other: ')){ const e=document.getElementById('sm_reference_other'); if(e)e.value=s.reference.replace('Other: ',''); }
      // Restore marks
      if(s.marks10th) markPillSelect('10th',s.marks10th);
      if(s.marks12th) markPillSelect('12th',s.marks12th);
      if(s.marksGrad) markPillSelect('grad',s.marksGrad);
      if(s.marksPGrad) markPillSelect('pgrad',s.marksPGrad);
      if(s.courseId){ sel.value=s.courseId; loadBatchesForModal(s.batch); }
      // Restore photo
      restoreStudentPhoto(s.photo||'');
      // Restore instalments
      instalmentList=s.instalments?JSON.parse(JSON.stringify(s.instalments)):[]; // deep clone so editing in the modal doesn't mutate the saved record until Save
      renderInstalmentRows();
    }
  } else {
    document.getElementById('stuModalTitle').textContent='Add Student';
  }
  openModal('studentModal');
}
/** Rebuilds the Batch dropdown inside the student modal based on whichever course is
 * currently selected, optionally pre-selecting a given batch. */
function loadBatchesForModal(selectedBatch=''){
  const courseId=document.getElementById('sm_course').value;
  const courses=DB.get('mv_courses',[]);
  const course=courses.find(c=>c.id===courseId);
  const sel=document.getElementById('sm_batch');
  sel.innerHTML='<option value="">Select Batch</option>';
  if(course&&course.batches){ course.batches.forEach(b=>{ const o=document.createElement('option'); o.value=b; o.textContent=b; if(b===selectedBatch)o.selected=true; sel.appendChild(o); }); }
}
/** Switches between the 5 tabs of the student modal (Personal / Education / Address /
 * Course / Fee Schedule), styling the active tab and lazily building the marks table or
 * instalment rows only when their tab is opened. */
function showStudentTab(n){
  for(let i=1;i<=5;i++){
    const body=document.getElementById('stabBody'+i);
    const tab=document.getElementById('stab'+i);
    if(body) body.style.display=(i===n)?'block':'none';
    if(tab){
      tab.style.color=(i===n)?'var(--blue)':'var(--muted)';
      tab.style.borderBottom=(i===n)?'2.5px solid var(--blue)':'2.5px solid transparent';
    }
  }
  if(n===2) buildMarksTable();
  if(n===5) renderInstalmentRows();
}

/** Builds the 10th/12th/Graduation/Post-Grad marks-percentage grid (radio-button-backed
 * pill selectors) inside the student modal's Education tab. */
function buildMarksTable(){
  const ranges=['<50%','50-60%','60-70%','70-80%','80-90%','>90%'];
  const cols=['10th','12th','grad','pgrad'];
  const tbody=document.getElementById('marksTableBody');
  if(!tbody)return;
  tbody.innerHTML=ranges.map((r,ri)=>`
    <tr style="background:${ri%2===0?'var(--card)':'var(--bg)'};">
      <td style="padding:8px 10px;font-weight:700;font-size:12.5px;border:1px solid var(--border);color:var(--navy);">${r}</td>
      ${cols.map(col=>`<td style="padding:8px 10px;text-align:center;border:1px solid var(--border);">
        <label style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:2px solid var(--border);cursor:pointer;transition:all .15s;" id="mclbl_${col}_${r.replace(/[^a-z0-9]/gi,'_')}">
          <input type="radio" name="sm_marks_${col}" value="${r}" style="display:none;" onchange="markPillSelect('${col}','${r}')"/>
          <span style="width:10px;height:10px;border-radius:50%;background:transparent;transition:.15s;" id="mcdot_${col}_${r.replace(/[^a-z0-9]/gi,'_')}"></span>
        </label>
      </td>`).join('')}
    </tr>`).join('');
}

/** Visually highlights the selected marks-percentage pill for one education column
 * (10th/12th/grad/pgrad) and clears the others in that column. */
function markPillSelect(col, val){
  // Highlight selected row cell
  const ranges=['<50%','50-60%','60-70%','70-80%','80-90%','>90%'];
  ranges.forEach(r=>{
    const key=r.replace(/[^a-z0-9]/gi,'_');
    const lbl=document.getElementById('mclbl_'+col+'_'+key);
    const dot=document.getElementById('mcdot_'+col+'_'+key);
    if(lbl&&dot){
      const sel=r===val;
      lbl.style.borderColor=sel?'var(--blue)':'var(--border)';
      lbl.style.background=sel?'var(--blue)':'transparent';
      dot.style.background=sel?'#fff':'transparent';
    }
  });
}

// ── Pill selector for edu / stream / board / reference ──
/** Handles clicking an education/stream/board pill: marks it selected, stores its value in
 * the paired hidden input, and reveals the 'Other' text box if 'Other' was chosen. */
function selectEduPill(label, fieldId, value){
  // Deselect all pills in same group
  const parent=label.parentElement;
  parent.querySelectorAll('.edu-pill').forEach(p=>p.classList.remove('selected'));
  label.classList.add('selected');
  // Store value in hidden input
  const hidden=document.getElementById(fieldId);
  if(hidden) hidden.value=value;
  // Show/hide Other text box
  const otherBox=document.getElementById(fieldId+'_other_box');
  if(otherBox) otherBox.style.display=(value==='Other')?'block':'none';
  if(value!=='Other'){
    const otherInput=document.getElementById(fieldId+'_other');
    if(otherInput) otherInput.value='';
  }
}

/** Handles clicking a 'How did you hear about us' reference pill: highlights it, stores
 * the value, and reveals the 'Other' text box when needed. */
function selectReference(label, value){
  document.querySelectorAll('[id^="refl_"]').forEach(p=>{
    p.style.background='var(--card)';
    p.style.borderColor='var(--border)';
    p.style.color='var(--text)';
  });
  label.style.background='var(--navy)';
  label.style.borderColor='var(--navy)';
  label.style.color='#fff';
  const hidden=document.getElementById('sm_reference');
  if(hidden) hidden.value=value;
  const otherBox=document.getElementById('sm_reference_other_box');
  if(otherBox) otherBox.style.display=(value==='Other')?'block':'none';
  if(value!=='Other'){
    const oi=document.getElementById('sm_reference_other');
    if(oi) oi.value='';
  }
}

// Reset all edu pills
/** Clears every pill selection (education/stream/board/reference) and their 'Other' text
 * boxes — used when opening the modal for a brand-new student. */
function resetEduPills(){
  document.querySelectorAll('.edu-pill').forEach(p=>p.classList.remove('selected'));
  ['sm_edu','sm_stream','sm_board'].forEach(id=>{
    const h=document.getElementById(id); if(h) h.value='';
    const b=document.getElementById(id+'_other_box'); if(b) b.style.display='none';
    const i=document.getElementById(id+'_other'); if(i) i.value='';
  });
  document.querySelectorAll('[id^="refl_"]').forEach(p=>{
    p.style.background='var(--card)';p.style.borderColor='var(--border)';p.style.color='var(--text)';
  });
  const rh=document.getElementById('sm_reference');if(rh)rh.value='';
  const rb=document.getElementById('sm_reference_other_box');if(rb)rb.style.display='none';
  const ri=document.getElementById('sm_reference_other');if(ri)ri.value='';
}

// Restore pill state when editing
/** Re-applies the 'selected' highlight to whichever education/stream/board pill matches a
 * saved value, when editing an existing student. */
function restoreEduPill(fieldId, value){
  if(!value)return;
  const pills=document.querySelectorAll(`[onclick*="selectEduPill(this,'${fieldId}'"]`);
  pills.forEach(p=>{
    if(p.getAttribute('onclick').includes("'"+value+"'")){
      p.classList.add('selected');
      const otherBox=document.getElementById(fieldId+'_other_box');
      if(otherBox&&value==='Other') otherBox.style.display='block';
    }
  });
  const hidden=document.getElementById(fieldId);
  if(hidden) hidden.value=value;
}

/** Re-applies the 'selected' highlight to the saved reference-source pill when editing an
 * existing student. */
function restoreReferencePill(value){
  if(!value)return;
  const map={'Recommendation':'refl_0','Read in News Paper':'refl_1','Saw in Television':'refl_2',
    'Microvision Marketing Person':'refl_3','Saw Banner/Poster/Board':'refl_4','Other':'refl_5'};
  const id=map[value];
  if(id){
    const el=document.getElementById(id);
    if(el){el.style.background='var(--navy)';el.style.borderColor='var(--navy)';el.style.color='#fff';}
  }
  const hidden=document.getElementById('sm_reference');if(hidden)hidden.value=value;
  const otherBox=document.getElementById('sm_reference_other_box');
  if(otherBox&&value==='Other') otherBox.style.display='block';
}

/** Returns the value of whichever radio button in a named group is currently checked (or
 * '' if none). */
function getRadioVal(name){
  const el=document.querySelector('input[name="'+name+'"]:checked');
  return el?el.value:'';
}
/** Checks the radio button in a named group that matches the given value. */
function setRadioVal(name,val){
  const el=document.querySelector('input[name="'+name+'"][value="'+val+'"]');
  if(el) el.checked=true;
}
// Get hidden field or text value (for edu pills)
/** Reads a pill-selector's hidden value; if it's 'Other', appends the free-text 'Other'
 * box's contents (e.g. 'Other: Something'). */
function getHiddenOrRadio(fieldId, otherFieldId){
  const h=document.getElementById(fieldId);
  const val=h?h.value:'';
  if(val==='Other'){
    const o=document.getElementById(otherFieldId);
    return o&&o.value?'Other: '+o.value:'Other';
  }
  return val;
}

/** Reads every field out of the student modal into one data object and either updates the
 * existing student record (editingStudentId) or creates a new one, then closes the modal,
 * re-renders the list, and refreshes the dues badge. Re-enrolling a completed student
 * flips them back to ongoing. */
function saveStudent(){
  const name=document.getElementById('sm_name').value.trim();
  if(!name){ showToast('Name is required','error'); return; }
  const students=DB.get('mv_students',[]);
  const gv2=id=>{ const e=document.getElementById(id); return e?e.value:''; };
  const data={
    name,
    father:gv2('sm_father'),
    regNo:gv2('sm_regNo'),
    dob:gv2('sm_dob'),
    phone:gv2('sm_phone'),
    whatsapp:gv2('sm_whatsapp'),
    email:gv2('sm_email'),
    gender:getRadioVal('sm_gender'),
    marital:gv2('sm_marital'),
    income:gv2('sm_income'),
    occupation:gv2('sm_occupation'),
    org:gv2('sm_org'),
    designation:gv2('sm_designation'),
    school:gv2('sm_school'),
    yearClass:gv2('sm_yearclass'),
    reference:getHiddenOrRadio('sm_reference','sm_reference_other'),
    joinDate:gv2('sm_joinDate'),
    // Education — now using hidden inputs (pill selection)
    education:getHiddenOrRadio('sm_edu','sm_edu_other'),
    stream:getHiddenOrRadio('sm_stream','sm_stream_other'),
    board:getHiddenOrRadio('sm_board','sm_board_other'),
    referenceOther:document.getElementById('sm_reference_other')?.value||'',
    marks10th:getRadioVal('sm_marks_10th'),
    marks12th:getRadioVal('sm_marks_12th'),
    marksGrad:getRadioVal('sm_marks_grad'),
    marksPGrad:getRadioVal('sm_marks_pgrad'),
    // Address
    address:gv2('sm_address'),
    permAddress:gv2('sm_permAddress'),
    pincode:gv2('sm_pincode'),
    landmark:gv2('sm_landmark'),
    // Office use
    formNo:gv2('sm_formNo'),
    session:gv2('sm_session'),
    batchCode:gv2('sm_batchCode'),
    days:gv2('sm_days'),
    slot:gv2('sm_slot'),
    startDate:gv2('sm_startDate'),
    courseId:gv2('sm_course'),
    batch:gv2('sm_batch'),
    totalFee:parseFloat(gv2('sm_totalFee'))||0,
    faculty:gv2('sm_faculty'),
    grade:gv2('sm_grade'),
    refPerson:gv2('sm_refPerson'),
    photo:gv2('sm_photoBase64'),
    instalments:JSON.parse(JSON.stringify(instalmentList)), // deep clone snapshot at save time
    active:true
  };
  if(editingStudentId){
    const i=students.findIndex(s=>s.id===editingStudentId);
    if(i>=0){
      const wasCompleted=students[i].courseStatus==='completed';
      students[i]={...students[i],...data};
      // If re-enrolling a completed student (course changed), mark ongoing again
      if(wasCompleted){
        students[i].courseStatus='ongoing';
        delete students[i].completedAt;
        showToast('🔄 Student re-enrolled as ongoing!','success');
      }
    }
  } else {
    data.id=uuid(); data.feesPaid=0; students.push(data);
  }
  DB.set('mv_students',students);
  closeModal('studentModal');
  renderStudents(document.getElementById('stuSearch')?.value||'', stuStatusFilter);
  updateDuesBadge();
  showToast(editingStudentId?'Student updated!':'Student added!','success');
}
/** Shortcut that opens the student modal pre-filled for editing. */
function editStudent(id){ openStudentModal(id); }
/** Deletes a student record after confirmation and re-renders the list. */
function deleteStudent(id){
  if(!confirm('Delete this student?'))return;
  const students=DB.get('mv_students',[]).filter(s=>s.id!==id);
  DB.set('mv_students',students); renderStudents(); showToast('Student deleted');
}
/** Renders the Courses page: one card per course showing its fee/duration,
 * enrolled-student count, and its list of batches, with Edit/Delete actions. */
function renderCourses(){
  const courses=DB.get('mv_courses',[]);
  const el=document.getElementById('coursesList');
  if(!courses.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">📚</div><div class="empty-text">No courses yet</div><div class="empty-sub">Add your first course</div></div>'; return;
  }
  const students=DB.get('mv_students',[]);
  el.innerHTML=courses.map(c=>{
    const enrolled=students.filter(s=>s.courseId===c.id).length;
    return `<div class="card" style="margin-bottom:14px;">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-size:24px;">📚</div>
          <div><div class="card-title">${c.name}</div>
          <div style="font-size:12px;color:var(--muted);">${c.duration||''} • ${fmtFull(c.fee||0)} total fee</div></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="openCourseModal('${c.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCourse('${c.id}')">🗑</button>
        </div>
      </div>
      <div class="card-body" style="display:flex;gap:20px;flex-wrap:wrap;">
        <div><span class="stat-label" style="font-size:12px">Students Enrolled</span><div style="font-size:20px;font-weight:800;color:var(--navy)">${enrolled}</div></div>
        <div><span class="stat-label" style="font-size:12px">Batches</span>
          <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;">
            ${(c.batches||[]).map(b=>'<span class="badge badge-blue">'+b+'</span>').join('')||'<span style="color:var(--muted);font-size:12px">No batches</span>'}
          </div>
        </div>
        ${c.description?'<div style="flex:1"><span class="stat-label" style="font-size:12px">Description</span><div style="font-size:13px;margin-top:2px;">'+c.description+'</div></div>':''}
      </div></div>`;
  }).join('');
}
/** Opens the Add/Edit Course modal, pre-filled when editing an existing course. */
function openCourseModal(id=null){
  editingCourseId=id;
  if(id){
    document.getElementById('crsModalTitle').textContent='Edit Course';
    const c=DB.get('mv_courses',[]).find(x=>x.id===id);
    if(c){
      document.getElementById('cm_name').value=c.name||'';
      document.getElementById('cm_duration').value=c.duration||'';
      document.getElementById('cm_fee').value=c.fee||'';
      document.getElementById('cm_batches').value=(c.batches||[]).join(', ');
      document.getElementById('cm_desc').value=c.description||'';
    }
  } else {
    document.getElementById('crsModalTitle').textContent='Add Course';
    ['cm_name','cm_duration','cm_fee','cm_batches','cm_desc'].forEach(id=>{ const e=document.getElementById(id); if(e)e.value=''; });
  }
  openModal('courseModal');
}
/** Validates and saves the course form (name, duration, fee, comma-separated batch list,
 * description) as a new or updated course record. */
function saveCourse(){
  const name=document.getElementById('cm_name').value.trim();
  if(!name){ showToast('Course name is required','error'); return; }
  const courses=DB.get('mv_courses',[]);
  const data={
    name, duration:document.getElementById('cm_duration').value,
    fee:parseFloat(document.getElementById('cm_fee').value)||0,
    batches:document.getElementById('cm_batches').value.split(',').map(s=>s.trim()).filter(Boolean),
    description:document.getElementById('cm_desc').value
  };
  if(editingCourseId){
    const i=courses.findIndex(c=>c.id===editingCourseId);
    if(i>=0) courses[i]={...courses[i],...data};
  } else { data.id=uuid(); courses.push(data); }
  DB.set('mv_courses',courses);
  closeModal('courseModal');
  renderCourses();
  showToast(editingCourseId?'Course updated!':'Course added!','success');
}
/** Deletes a course after confirmation. */
function deleteCourse(id){
  if(!confirm('Delete this course?'))return;
  DB.set('mv_courses',DB.get('mv_courses',[]).filter(c=>c.id!==id));
  renderCourses(); showToast('Course deleted');
}

// ══════════════════════════════════════════
//  FEE DUES
// ══════════════════════════════════════════
/** Renders the Dues page: one card per student with an outstanding balance, showing their
 * fee progress, a Collect/Remind action, and (if they have one) a toggleable instalment
 * schedule. */
function renderDues(){
  const students=DB.get('mv_students',[]);
  const dues=students.filter(s=>(s.totalFee||0)>(s.feesPaid||0)).sort((a,b)=>(b.totalFee-b.feesPaid)-(a.totalFee-a.feesPaid));
  const el=document.getElementById('duesList');
  if(!dues.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">🎉</div><div class="empty-text">No pending dues!</div><div class="empty-sub">All students are up to date</div></div>'; return;
  }
  const courses=DB.get('mv_courses',[]);
  el.innerHTML=dues.map(s=>{
    const course=courses.find(c=>c.id===s.courseId);
    const due=s.totalFee-s.feesPaid; const pct=Math.round(s.feesPaid/s.totalFee*100);

    // Find the next unpaid instalment (earliest due date among status!=='paid') so we can
    // show "X days left" / "X days overdue" right on the card, not just inside the schedule.
    let dueDateBadge='';
    if(s.instalments&&s.instalments.length){
      const unpaid=s.instalments.filter(i=>i.status!=='paid'&&i.dueDate);
      if(unpaid.length){
        unpaid.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
        const next=unpaid[0];
        const today=new Date(); today.setHours(0,0,0,0);
        const dueD=new Date(next.dueDate); dueD.setHours(0,0,0,0);
        const diffDays=Math.round((dueD-today)/(1000*60*60*24)); // >0 = days left, 0 = today, <0 = overdue
        if(diffDays<0){
          dueDateBadge=`<span class="badge badge-red" style="margin-top:6px;display:inline-block;">🔴 ${-diffDays} day${-diffDays>1?'s':''} overdue (${next.dueDate})</span>`;
        } else if(diffDays===0){
          dueDateBadge=`<span class="badge badge-yellow" style="margin-top:6px;display:inline-block;">🟡 Due today</span>`;
        } else {
          dueDateBadge=`<span class="badge badge-blue" style="margin-top:6px;display:inline-block;">🔵 ${diffDays} day${diffDays>1?'s':''} left (${next.dueDate})</span>`;
        }
      }
    }

    return `<div class="card" style="margin-bottom:12px;">
      <div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:160px;">
          <div style="font-weight:700;font-size:15px;">${s.name}</div>
          <div style="font-size:12px;color:var(--muted)">${course?course.name:'-'} • ${s.regNo||''}</div>
          <div class="fee-bar" style="margin-top:6px;width:200px"><div class="fee-bar-fill ${pct<40?'danger':pct<80?'warn':''}" style="width:${pct}%"></div></div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${pct}% paid</div>
          ${dueDateBadge}
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:var(--muted)">Total: ${fmtFull(s.totalFee)}</div>
          <div style="font-size:12px;color:var(--green)">Paid: ${fmtFull(s.feesPaid)}</div>
          <div style="font-size:18px;font-weight:800;color:var(--red)">Due: ${fmtFull(due)}</div>
        </div>
        <div>
          <button class="btn btn-primary btn-sm" onclick="quickReceipt('${s.id}')">🖨️ Collect</button>
          <button class="btn btn-outline btn-sm" onclick="shareReminderWA('${s.id}')">📱 Remind</button>
          ${s.instalments&&s.instalments.length?`<button class="btn btn-ghost btn-sm" onclick="toggleInstSchedule('${s.id}')">📅 Schedule</button>`:''}
        </div>
      </div>
      ${s.instalments&&s.instalments.length?`
      <div id="instSched_${s.id}" style="display:none;padding:0 18px 14px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">📅 Instalment Schedule</div>
        ${s.instalments.map((inst,i)=>{
          const today=new Date(); const due=inst.dueDate?new Date(inst.dueDate):null;
          const isOverdue=inst.status!=='paid'&&due&&due<today;
          const statusClass=inst.status==='paid'?'paid':isOverdue?'overdue':'';
          return `<div class="inst-sched-row">
            <div class="inst-sched-num ${statusClass}">${i+1}</div>
            <div class="inst-sched-info">
              <div style="font-size:13px;font-weight:600;">${inst.amount?fmtFull(inst.amount):'-'}</div>
              <div class="inst-sched-date">Due: ${inst.dueDate||'Not set'}</div>
            </div>
            <span class="badge ${inst.status==='paid'?'badge-green':isOverdue?'badge-red':'badge-yellow'}">${inst.status==='paid'?'Paid':isOverdue?'Overdue':'Pending'}</span>
          </div>`;
        }).join('')}
      </div>`:''}
    </div>`;
  }).join('');
}
/** Shows/hides a given student's instalment-schedule detail panel on the Dues page. */
function toggleInstSchedule(id){
  const el=document.getElementById('instSched_'+id);
  if(el) el.style.display=el.style.display==='none'?'block':'none';
}

/** Opens WhatsApp Web/App with a pre-written fee-reminder message for the given student,
 * addressed using the institute name from settings. */
function shareReminderWA(id){
  const s=DB.get('mv_students',[]).find(x=>x.id===id);
  if(!s)return;
  const due=Math.max(0,(s.totalFee||0)-(s.feesPaid||0));
  const sett=DB.get('mv_settings',{});
  const msg='Dear *'+s.name+'*,\n\nThis is a gentle reminder from *'+(sett.instituteName||'Microvision')+'* regarding your pending fee of *₹'+due.toLocaleString('en-IN')+'*.\n\nPlease clear your dues at the earliest.\n\nThank you!';
  window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(msg),'_blank');
}
// ══════════════════════════════════════════
//  NOTIFICATION SYSTEM
// ══════════════════════════════════════════

/** Handles the student photo file input: rejects files over 2MB, otherwise reads it as a
 * base64 data URL for the preview and hidden form field. */
function uploadStudentPhoto(input){
  const file=input.files[0]; if(!file)return;
  if(file.size>2*1024*1024){ showToast('Photo too large (max 2MB)','error'); input.value=''; return; }
  const reader=new FileReader();
  reader.onload=e=>{
    const dataUrl=e.target.result;
    document.getElementById('sm_photoBase64').value=dataUrl;
    const img=document.getElementById('stuPhotoImg');
    const ph=document.getElementById('stuPhotoPlaceholder');
    const btn=document.getElementById('stuPhotoRemoveBtn');
    if(img){ img.src=dataUrl; img.style.display='block'; }
    if(ph) ph.style.display='none';
    if(btn) btn.style.display='inline-flex';
    showToast('Photo uploaded!','success');
  };
  reader.readAsDataURL(file);
  input.value='';
}
/** Clears the currently-selected/loaded student photo from the form and preview. */
function removeStudentPhoto(){
  document.getElementById('sm_photoBase64').value='';
  const img=document.getElementById('stuPhotoImg');
  const ph=document.getElementById('stuPhotoPlaceholder');
  const btn=document.getElementById('stuPhotoRemoveBtn');
  if(img){ img.style.display='none'; img.src=''; }
  if(ph) ph.style.display='';
  if(btn) btn.style.display='none';
  showToast('Photo removed');
}
/** Restores a previously-saved photo (or clears the preview if none) — used when opening
 * the modal to edit an existing student. */
function restoreStudentPhoto(photoBase64){
  const img=document.getElementById('stuPhotoImg');
  const ph=document.getElementById('stuPhotoPlaceholder');
  const btn=document.getElementById('stuPhotoRemoveBtn');
  document.getElementById('sm_photoBase64').value=photoBase64||'';
  if(photoBase64){
    if(img){ img.src=photoBase64; img.style.display='block'; }
    if(ph) ph.style.display='none';
    if(btn) btn.style.display='inline-flex';
  } else {
    if(img){ img.style.display='none'; img.src=''; }
    if(ph) ph.style.display='';
    if(btn) btn.style.display='none';
  }
}

// ══════════════════════════════════════════
//  FEE INSTALMENT SCHEDULE
// ══════════════════════════════════════════
let instalmentList=[];

/** Renders the editable instalment-schedule rows (date/amount/status/delete) inside the
 * student modal's Fee Schedule tab, built from the in-memory instalmentList array. */
function renderInstalmentRows(){
  const wrap=document.getElementById('instalmentRows');
  if(!wrap)return;
  if(!instalmentList.length){
    wrap.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">No instalments added yet. Click "+ Add Instalment" to begin.</div>';
    return;
  }
  wrap.innerHTML=instalmentList.map((inst,i)=>`
    <div class="inst-sched-row" id="instRow${i}">
      <div class="inst-sched-num ${inst.status||''}">${i+1}</div>
      <div class="inst-sched-info">
        <input type="date" value="${inst.dueDate||''}" onchange="instalmentList[${i}].dueDate=this.value" style="border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:'Outfit',sans-serif;"/>
      </div>
      <input type="number" placeholder="Amount ₹" value="${inst.amount||''}" onchange="instalmentList[${i}].amount=parseFloat(this.value)||0" style="width:110px;border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;font-size:13px;font-family:'Outfit',sans-serif;"/>
      <select onchange="instalmentList[${i}].status=this.value" style="border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;font-family:'Outfit',sans-serif;">
        <option value="" ${!inst.status?'selected':''}>Pending</option>
        <option value="paid" ${inst.status==='paid'?'selected':''}>Paid</option>
        <option value="overdue" ${inst.status==='overdue'?'selected':''}>Overdue</option>
      </select>
      <button class="btn btn-danger btn-xs" onclick="instalmentList.splice(${i},1);renderInstalmentRows()">🗑</button>
    </div>`).join('');
}

/** Appends a blank instalment entry to instalmentList and re-renders the rows. */
function addInstalmentRow(){
  instalmentList.push({dueDate:'',amount:0,status:''});
  renderInstalmentRows();
}

/** Empties the in-memory instalment schedule and re-renders (used when opening the modal
 * for a new student). */
function clearInstalmentSchedule(){
  instalmentList=[];
  renderInstalmentRows();
}

