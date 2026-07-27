/** Maps a percentage score to a grade band: <33% Failed, <70% Pass, <80% Good, <90% Very
 * Good, <100% Excellent, exactly 100% Outstanding. Returns the grade name, a CSS class, an
 * emoji, and PASS/FAIL. */
function calcGrade(pct){
  const p = parseFloat(pct);
  if(isNaN(p) || p < 0)  return {grade:'—',   cls:'',             emoji:'',  result:'—'};
  if(p < 33)             return {grade:'Failed',    cls:'grade-fail',        emoji:'❌', result:'FAIL'};
  if(p < 70)             return {grade:'Pass',       cls:'grade-pass',        emoji:'📋', result:'PASS'};
  if(p < 80)             return {grade:'Good',       cls:'grade-good',        emoji:'✅', result:'PASS'};
  if(p < 90)             return {grade:'Very Good',  cls:'grade-verygood',    emoji:'👍', result:'PASS'};
  if(p < 100)            return {grade:'Excellent',  cls:'grade-excellent',   emoji:'⭐', result:'PASS'};
  if(p === 100)          return {grade:'Outstanding',cls:'grade-outstanding', emoji:'🏆', result:'PASS'};
  return                        {grade:'—',          cls:'',                  emoji:'',   result:'—'};
}

/** Wraps calcGrade() output as a small colored HTML badge for display in tables/cards. */
function gradeBadge(pct){
  const g = calcGrade(pct);
  if(!g.grade||g.grade==='—') return '<span style="color:var(--muted);font-size:12px;">—</span>';
  return `<span class="grade-badge ${g.cls}">${g.emoji} ${g.grade}</span>`;
}

// ── Subject row management ──
let subjectRowCount = 0;
/** Adds one editable subject row (name / max marks / obtained marks / live grade) to the
 * exam form, wiring its inputs to recalcExam()/updateSubjectGrade(). Each row gets a
 * unique numeric id via the subjectRowCount counter. */
function addSubjectRow(name='', max=100, obtained=''){
  subjectRowCount++;
  const id = subjectRowCount;
  const container = document.getElementById('subjectRowsContainer');
  if(!container) return;
  const div = document.createElement('div');
  div.id = 'srow_'+id;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 90px 90px 110px 36px;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);align-items:center;';
  div.innerHTML = `
    <input value="${name}" placeholder="Subject name" style="border:1.5px solid var(--border);border-radius:7px;padding:7px 10px;font-size:13px;font-family:'Outfit',sans-serif;background:var(--input-bg);color:var(--text);outline:none;width:100%;" oninput="recalcExam()" id="sname_${id}"/>
    <input value="${max}" type="number" min="1" max="200" placeholder="100" style="border:1.5px solid var(--border);border-radius:7px;padding:7px 8px;font-size:13px;text-align:center;font-family:'Outfit',sans-serif;background:var(--input-bg);color:var(--text);outline:none;width:100%;" oninput="recalcExam()" id="smax_${id}"/>
    <input value="${obtained}" type="number" min="0" placeholder="—" class="marks-input" style="width:100%;" oninput="recalcExam();updateSubjectGrade(${id})" id="sobt_${id}"/>
    <div id="sgrade_${id}" style="text-align:center;font-size:12px;font-weight:700;">—</div>
    <button onclick="removeSubjectRow(${id})" style="background:var(--red-light);border:1px solid var(--red-pale);border-radius:6px;width:28px;height:28px;cursor:pointer;color:var(--red);font-size:15px;display:flex;align-items:center;justify-content:center;">×</button>`;
  container.appendChild(div);
  if(obtained !== '') updateSubjectGrade(id);
}

/** Removes a subject row from the exam form by id and recalculates the overall total. */
function removeSubjectRow(id){
  const el = document.getElementById('srow_'+id);
  if(el) el.remove();
  recalcExam();
}

/** Recomputes and redisplays just one subject row's grade badge based on its own
 * obtained/max marks. */
function updateSubjectGrade(id){
  const max  = parseFloat(document.getElementById('smax_'+id)?.value) || 0;
  const obt  = parseFloat(document.getElementById('sobt_'+id)?.value);
  const gdiv = document.getElementById('sgrade_'+id);
  if(!gdiv) return;
  if(isNaN(obt) || max <= 0){ gdiv.innerHTML = '—'; return; }
  const pct = (obt / max) * 100;
  gdiv.innerHTML = gradeBadge(pct);
}

/** Sums obtained/max marks across every subject row currently in the form and updates the
 * overall total, percentage, grade and pass/fail summary box. */
function recalcExam(){
  let totalMax = 0, totalObt = 0, allFilled = true;
  // gather all subject rows
  document.querySelectorAll('[id^="srow_"]').forEach(row=>{
    const id = row.id.replace('srow_','');
    const max = parseFloat(document.getElementById('smax_'+id)?.value) || 0;
    const obt = parseFloat(document.getElementById('sobt_'+id)?.value);
    totalMax += max;
    if(!isNaN(obt)) totalObt += obt;
    else allFilled = false;
  });
  const summaryBox = document.getElementById('examSummaryBox');
  if(!summaryBox) return;
  if(totalMax > 0){
    summaryBox.style.display = 'block';
    const pct = (totalObt / totalMax) * 100;
    const g   = calcGrade(pct);
    document.getElementById('ex_totalDisplay').textContent   = totalObt + ' / ' + totalMax;
    document.getElementById('ex_percentDisplay').textContent = pct.toFixed(2) + '%';
    document.getElementById('ex_gradeDisplay').textContent   = g.emoji + ' ' + g.grade;
    document.getElementById('ex_resultDisplay').textContent  = g.result;
  } else {
    summaryBox.style.display = 'none';
  }
}

// ── Open Exam Modal ──
let editingExamId = null;
/** Opens the exam entry modal. With no examId, starts a blank form with 3 default subject
 * rows; with an examId, loads that exam's saved subjects back in and recalculates the
 * summary. */
function openExamModal(examId=null){
  editingExamId = examId;
  subjectRowCount = 0;
  document.getElementById('subjectRowsContainer').innerHTML = '';
  document.getElementById('examSummaryBox').style.display = 'none';

  // Populate student dropdown
  const students = DB.get('mv_students',[]);
  const sel = document.getElementById('ex_student');
  sel.innerHTML = '<option value="">-- Select Student --</option>' +
    students.filter(s=>s.active!==false).map(s=>`<option value="${s.id}">${s.name} ${s.regNo?'('+s.regNo+')':''}</option>`).join('');

  // Set date default
  const dateEl = document.getElementById('ex_date');
  if(dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0,10);

  if(examId){
    // Load existing exam for edit
    document.getElementById('examModalTitle').textContent = '✏️ Edit Exam Entry';
    const exams = DB.get('mv_exams',[]);
    const ex = exams.find(e=>e.id===examId);
    if(ex){
      document.getElementById('ex_student').value = ex.studentId || '';
      document.getElementById('ex_name').value    = ex.examName  || '';
      document.getElementById('ex_date').value    = ex.date      || '';
      document.getElementById('ex_course').value  = ex.course    || '';
      (ex.subjects||[]).forEach(s=>addSubjectRow(s.name, s.max, s.obtained));
      recalcExam();
    }
  } else {
    document.getElementById('examModalTitle').textContent = '📝 New Exam Entry';
    document.getElementById('ex_name').value   = '';
    document.getElementById('ex_course').value = '';
    // Add 3 default subject rows
    addSubjectRow('',100,'');
    addSubjectRow('',100,'');
    addSubjectRow('',100,'');
  }
  openModal('examModal');
}

/** When a different student is picked in the exam form, auto-fills the Course field from
 * that student's enrolled course. */
function onExamStudentChange(){
  const id = document.getElementById('ex_student').value;
  if(!id) return;
  const s = DB.get('mv_students',[]).find(x=>x.id===id);
  if(s){
    const courses = DB.get('mv_courses',[]);
    const course  = courses.find(c=>c.id===s.courseId);
    const courseEl = document.getElementById('ex_course');
    if(courseEl) courseEl.value = course ? course.name : '';
  }
}

// ── Save Exam ──
/** Validates the exam form (student + name required, at least one subject), gathers every
 * subject row into a subjects array, computes the overall percentage/grade/result, and
 * saves it as a new or updated exam record. */
function saveExam(){
  const studentId = document.getElementById('ex_student').value;
  const examName  = document.getElementById('ex_name').value.trim();
  if(!studentId){ showToast('Please select a student','error'); return; }
  if(!examName)  { showToast('Please enter exam name','error'); return; }

  const subjects = [];
  let totalMax = 0, totalObt = 0;
  document.querySelectorAll('[id^="srow_"]').forEach(row=>{
    const id  = row.id.replace('srow_','');
    const name = document.getElementById('sname_'+id)?.value?.trim() || 'Subject';
    const max  = parseFloat(document.getElementById('smax_'+id)?.value)  || 100;
    const obt  = parseFloat(document.getElementById('sobt_'+id)?.value);
    subjects.push({name, max, obtained: isNaN(obt)?null:obt});
    totalMax += max;
    if(!isNaN(obt)) totalObt += obt;
  });

  if(subjects.length === 0){ showToast('Add at least one subject','error'); return; }

  const pct   = totalMax > 0 ? (totalObt / totalMax) * 100 : 0;
  const grade = calcGrade(pct);

  const student = DB.get('mv_students',[]).find(s=>s.id===studentId);
  const exams   = DB.get('mv_exams',[]);

  const data = {
    id: editingExamId || uuid(),
    studentId,
    studentName: student ? student.name : '',
    examName,
    date: document.getElementById('ex_date').value,
    course: document.getElementById('ex_course').value,
    subjects,
    totalMax,
    totalObt,
    percentage: parseFloat(pct.toFixed(2)),
    grade: grade.grade,
    result: grade.result,
    createdAt: Date.now()
  };

  if(editingExamId){
    const idx = exams.findIndex(e=>e.id===editingExamId);
    if(idx>=0) exams[idx] = data;
  } else {
    exams.unshift(data);
  }
  DB.set('mv_exams', exams);
  closeModal('examModal');
  renderExams();
  showToast('✅ Exam record saved!','success');
}

// ── Render Exams List ──
/** Renders the Exam Marks list: rebuilds the course filter dropdown, applies
 * search/grade/course filters, and shows one result card per exam with a color-coded score
 * ring, grade badge, and pass/fail. */
function renderExams(){
  // Populate course filter
  const courses = DB.get('mv_courses',[]);
  const cf = document.getElementById('examCourseFilter');
  if(cf){
    const cur = cf.value;
    cf.innerHTML = '<option value="">All Courses</option>' +
      courses.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
    cf.value = cur;
  }

  let exams = DB.get('mv_exams',[]);
  const search      = (document.getElementById('examSearch')?.value||'').toLowerCase();
  const gradeFilter = document.getElementById('examGradeFilter')?.value||'';
  const courseFilter= document.getElementById('examCourseFilter')?.value||'';

  if(search)       exams = exams.filter(e=>e.studentName.toLowerCase().includes(search)||e.examName.toLowerCase().includes(search));
  if(gradeFilter)  exams = exams.filter(e=>e.grade===gradeFilter);
  if(courseFilter) exams = exams.filter(e=>e.course===courseFilter);

  const el = document.getElementById('examsList');
  if(!el) return;

  if(!exams.length){
    el.innerHTML = `<div style="text-align:center;padding:56px 20px;color:var(--muted);">
      <div style="font-size:52px;margin-bottom:14px;">📝</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);">No exam records yet</div>
      <div style="font-size:13px;margin-top:6px;">Click <strong>+ New Exam</strong> to add the first test result</div>
    </div>`;
    return;
  }

  el.innerHTML = exams.map(ex=>{
    const g   = calcGrade(ex.percentage);
    const pct = ex.percentage.toFixed(1);
    // Color ring based on result
    const ringColor = ex.result==='FAIL' ? 'var(--red)' :
                      ex.grade==='Outstanding' ? '#d97706' :
                      ex.grade==='Excellent'   ? 'var(--green)' :
                      ex.grade==='Very Good'   ? 'var(--blue)' :
                      ex.grade==='Good'        ? 'var(--purple,#7c3aed)' : 'var(--orange)';
    return `
    <div class="exam-card" onclick="viewExam('${ex.id}')">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <!-- Score Ring -->
        <div class="result-ring" style="border:4px solid ${ringColor};color:${ringColor};">
          ${pct}%
        </div>
        <!-- Info -->
        <div style="flex:1;min-width:160px;">
          <div style="font-size:15px;font-weight:800;color:var(--text);">${ex.studentName}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:3px;">${ex.examName}${ex.course?' • '+ex.course:''}</div>
          <div style="font-size:12px;color:var(--muted2);margin-top:2px;">📅 ${ex.date||'—'} &nbsp;|&nbsp; ${ex.subjects.length} subject${ex.subjects.length!==1?'s':''}</div>
        </div>
        <!-- Score & Grade -->
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;color:var(--text);">${ex.totalObt} / ${ex.totalMax}</div>
          <div style="margin-top:5px;">${gradeBadge(ex.percentage)}</div>
          <div style="font-size:12px;font-weight:700;color:${ex.result==='FAIL'?'var(--red)':'var(--green)'};margin-top:4px;">${ex.result}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── View Exam Detail ──
let viewingExamId = null;
/** Opens the read-only exam detail modal: a summary banner (score/grade/result) plus a
 * full per-subject marks breakdown table. */
function viewExam(id){
  viewingExamId = id;
  const exams = DB.get('mv_exams',[]);
  const ex    = exams.find(e=>e.id===id);
  if(!ex) return;
  const g   = calcGrade(ex.percentage);
  const pct = ex.percentage.toFixed(2);

  document.getElementById('examViewTitle').textContent = ex.examName + ' — ' + ex.studentName;
  document.getElementById('examViewBody').innerHTML = `
    <!-- Summary Banner -->
    <div style="background:linear-gradient(135deg,var(--navy),var(--navy2));border-radius:12px;padding:16px 20px;color:#fff;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.8px;">Student</div>
        <div style="font-size:18px;font-weight:800;">${ex.studentName}</div>
        <div style="font-size:13px;opacity:.8;margin-top:2px;">${ex.course||''} &nbsp;•&nbsp; ${ex.date||''}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:34px;font-weight:900;">${pct}%</div>
        <div style="font-size:13px;opacity:.8;">${ex.totalObt} / ${ex.totalMax} marks</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:13px;opacity:.7;margin-bottom:6px;">GRADE</div>
        <div style="font-size:18px;font-weight:800;padding:8px 18px;background:rgba(255,255,255,.15);border-radius:20px;border:2px solid rgba(255,255,255,.3);">${g.emoji} ${g.grade}</div>
        <div style="font-size:13px;font-weight:800;margin-top:6px;color:${ex.result==='FAIL'?'#fca5a5':'#86efac'};">${ex.result}</div>
      </div>
    </div>
    <!-- Subject breakdown -->
    <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Subject Breakdown</div>
    ${(ex.subjects||[]).map(s=>{
      const sp = s.max>0 && s.obtained!==null ? (s.obtained/s.max*100) : null;
      return `<div class="subject-row">
        <div style="font-weight:600;font-size:13.5px;">${s.name}</div>
        <div style="text-align:center;font-size:13px;color:var(--muted);">${s.obtained ?? '—'} / ${s.max}</div>
        <div style="text-align:center;font-size:13px;font-weight:700;">${sp!==null?sp.toFixed(1)+'%':'—'}</div>
        <div style="text-align:center;">${sp!==null?gradeBadge(sp):'—'}</div>
      </div>`;
    }).join('')}`;
  openModal('examViewModal');
}

/** Deletes the currently-viewed exam record after confirmation. */
function deleteCurrentExam(){
  if(!viewingExamId) return;
  if(!confirm('Delete this exam record?')) return;
  const exams = DB.get('mv_exams',[]).filter(e=>e.id!==viewingExamId);
  DB.set('mv_exams', exams);
  closeModal('examViewModal');
  renderExams();
  showToast('Exam record deleted');
}

/** Opens a new browser tab with a printable, self-contained HTML result sheet (institute
 * letterhead, marks table, grade box, signature line) for the currently-viewed exam, and
 * auto-triggers the print dialog. */
function printExamResult(){
  if(!viewingExamId) return;
  const ex = DB.get('mv_exams',[]).find(e=>e.id===viewingExamId);
  if(!ex) return;
  const g = calcGrade(ex.percentage);
  const s = DB.get('mv_settings',{});
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111;}
    .header{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px;}
    .inst{font-size:22px;font-weight:900;letter-spacing:2px;}
    .sub-inst{font-size:12px;font-weight:700;letter-spacing:.5px;}
    .title{font-size:16px;font-weight:800;text-align:center;margin:12px 0;text-decoration:underline;}
    table{width:100%;border-collapse:collapse;margin-top:12px;}
    th,td{border:1px solid #333;padding:7px 10px;font-size:13px;}
    th{background:#eee;font-weight:700;text-align:center;}
    .total-row td{font-weight:800;background:#f5f5f5;}
    .grade-box{text-align:center;border:3px solid #333;border-radius:8px;
      padding:12px 24px;display:inline-block;margin:16px auto;font-size:20px;font-weight:900;}
    .footer{margin-top:24px;display:flex;justify-content:space-between;border-top:1px solid #999;padding-top:10px;font-size:12px;}
  </style></head><body>
  <div class="header">
    <div class="inst">${s.instituteName||'MICROVISION'}®</div>
    <div class="sub-inst">${s.instituteSubtitle||'ADVANCED TECHNOLOGY INSTITUTE'}</div>
    <div style="font-size:11px;">${s.instituteAddress||''} | ${s.instituteMob||''}</div>
  </div>
  <div class="title">EXAM RESULT SHEET</div>
  <table style="margin-bottom:12px;width:auto;">
    <tr><td style="font-weight:700;">Student Name</td><td>${ex.studentName}</td><td style="font-weight:700;">Exam</td><td>${ex.examName}</td></tr>
    <tr><td style="font-weight:700;">Course</td><td>${ex.course||'—'}</td><td style="font-weight:700;">Date</td><td>${ex.date||'—'}</td></tr>
  </table>
  <table>
    <thead><tr><th>S.No.</th><th>Subject</th><th>Max Marks</th><th>Obtained</th><th>%</th><th>Grade</th></tr></thead>
    <tbody>
      ${(ex.subjects||[]).map((s,i)=>{
        const sp = s.max>0&&s.obtained!==null?(s.obtained/s.max*100):null;
        const sg = sp!==null?calcGrade(sp):{grade:'—'};
        return `<tr><td style="text-align:center;">${i+1}</td><td>${s.name}</td><td style="text-align:center;">${s.max}</td><td style="text-align:center;">${s.obtained??'—'}</td><td style="text-align:center;">${sp!==null?sp.toFixed(1)+'%':'—'}</td><td style="text-align:center;font-weight:700;">${sg.grade}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td colspan="2" style="text-align:right;">TOTAL</td><td style="text-align:center;">${ex.totalMax}</td><td style="text-align:center;">${ex.totalObt}</td><td style="text-align:center;">${ex.percentage.toFixed(2)}%</td><td style="text-align:center;">${g.grade}</td></tr>
    </tbody>
  </table>
  <div style="text-align:center;margin-top:16px;">
    <div class="grade-box">${g.emoji} ${g.grade} &nbsp;|&nbsp; ${ex.result}</div>
  </div>
  <div class="footer">
    <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
    <div>Signature & Stamp</div>
  </div>
  <script>window.onload=function(){window.print();};<\/script>
  </body></html>`;
  const w = window.open('','_blank','width=800,height=600');
  if(w){ w.document.write(html); w.document.close(); }
}

/** Exports every exam's full subject-by-subject marks breakdown to a single .xlsx
 * spreadsheet via SheetJS. */
function exportMarksExcel(){
  const exams = DB.get('mv_exams',[]);
  if(!exams.length){ showToast('No exam records to export','error'); return; }
  const rows = [];
  exams.forEach(ex=>{
    (ex.subjects||[]).forEach(s=>{
      const sp = s.max>0&&s.obtained!==null?(s.obtained/s.max*100).toFixed(2):null;
      rows.push({
        Student: ex.studentName, Exam: ex.examName, Date: ex.date, Course: ex.course,
        Subject: s.name, 'Max Marks': s.max, 'Obtained': s.obtained??'',
        '%': sp??'', 'Subject Grade': sp?calcGrade(parseFloat(sp)).grade:'',
        'Total %': ex.percentage, 'Overall Grade': ex.grade, Result: ex.result
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Exam Marks');
  XLSX.writeFile(wb, 'Microvision_ExamMarks_'+Date.now()+'.xlsx');
  showToast('Excel exported!','success');
}
