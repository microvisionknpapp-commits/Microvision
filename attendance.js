let attBatch='all';
/** Renders the daily attendance grid for the selected date: builds the batch filter pills,
 * loads any saved marks for that date, shows a Present/Absent/Leave/Not-Marked summary,
 * and one photo card per student with tap-to-mark buttons. */
function renderAttendance(){
  const date=document.getElementById('attDate').value;
  if(!date){ showToast('Please select a date','error'); return; }
  const students=DB.get('mv_students',[]);
  const courses=DB.get('mv_courses',[]);

  // Build batch list
  const batches=new Set();
  batches.add('all');
  students.forEach(s=>{ if(s.batch) batches.add(s.batch); });
  const batchBar=document.getElementById('attBatchBar');
  batchBar.innerHTML=[...batches].map(b=>`<button class="att-batch-pill ${b===attBatch?'active':''}" onclick="attBatch='${b}';renderAttendance()">${b==='all'?'All Students':b}</button>`).join('');

  // Filter students
  let filtered=students;
  if(attBatch!=='all') filtered=students.filter(s=>s.batch===attBatch);
  if(!filtered.length){
    document.getElementById('attGridWrap').innerHTML='<div style="text-align:center;padding:30px;color:var(--muted);">No students in this batch.</div>';
    return;
  }

  // Load saved attendance for this date
  const attData=DB.get('mv_attendance',{});
  const dayKey=date;
  const dayRec=attData[dayKey]||{};

  // Summary
  let p=0,a=0,l=0;
  filtered.forEach(s=>{
    const v=dayRec[s.id]||'';
    if(v==='P')p++;else if(v==='A')a++;else if(v==='L')l++;
  });
  document.getElementById('attSummaryBar').innerHTML=`
    <div class="att-sum-chip green"><span>${p}</span>Present</div>
    <div class="att-sum-chip red"><span>${a}</span>Absent</div>
    <div class="att-sum-chip yellow"><span>${l}</span>Leave</div>
    <div class="att-sum-chip"><span>${filtered.length-p-a-l}</span>Not Marked</div>`;

  document.getElementById('attGridWrap').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <button class="btn btn-success btn-sm" onclick="markAllAtt('P')">✅ Mark All Present</button>
      <button class="btn btn-danger btn-sm" onclick="markAllAtt('A')">❌ Mark All Absent</button>
    </div>
    <div class="att-grid" id="attGrid">${filtered.map(s=>{
      const v=dayRec[s.id]||'';
      const photo=s.photo||'';
      const photoHtml=photo?`<img src="${photo}" alt=""/>`:s.name.charAt(0);
      return `<div class="att-card">
        <div class="att-photo">${photo?`<img src="${photo}" alt=""/>`:'<span style="font-size:16px;font-weight:700;color:var(--muted)">${s.name.charAt(0)}</span>'}</div>
        <div style="flex:1;min-width:0;">
          <div class="att-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
          <div class="att-sub">${s.regNo||s.batch||''}</div>
        </div>
        <div class="att-toggle">
          <button class="att-btn${v==='P'?' present':''}" title="Present" onclick="setAtt('${s.id}','P','${date}')">✅</button>
          <button class="att-btn${v==='A'?' absent':''}" title="Absent" onclick="setAtt('${s.id}','A','${date}')">❌</button>
          <button class="att-btn${v==='L'?' leave':''}" title="Leave" onclick="setAtt('${s.id}','L','${date}')">🟡</button>
        </div>
      </div>`;
    }).join('')}</div>`;
}

/** Marks (or un-marks, if tapped again with the same value) one student's attendance for
 * one date, saves it, and re-renders the grid. */
function setAtt(stuId, val, date){
  const attData=DB.get('mv_attendance',{});
  if(!attData[date])attData[date]={};
  // Toggle off if same value
  if(attData[date][stuId]===val) delete attData[date][stuId];
  else attData[date][stuId]=val;
  DB.set('mv_attendance',attData);
  renderAttendance();
}

/** Bulk-marks every currently-filtered (batch) student as Present or Absent for the
 * selected date in one action. */
function markAllAtt(val){
  const date=document.getElementById('attDate').value;
  if(!date)return;
  const students=DB.get('mv_students',[]);
  let filtered=students;
  if(attBatch!=='all') filtered=students.filter(s=>s.batch===attBatch);
  const attData=DB.get('mv_attendance',{});
  if(!attData[date])attData[date]={};
  filtered.forEach(s=>{ attData[date][s.id]=val; });
  DB.set('mv_attendance',attData);
  renderAttendance();
  showToast(`Marked all ${val==='P'?'Present':'Absent'}!`,'success');
}

/** Attendance is actually auto-saved on every tap via setAtt() — this button just shows a
 * confirmation toast summarizing the day's Present/Absent/Leave counts. */
function saveAttendance(){
  // Attendance is auto-saved on each tap via setAtt().
  // This button provides a clear "done" action with a summary toast.
  const date=document.getElementById('attDate')?.value||'today';
  const attData=DB.get('mv_attendance',{});
  const dayRec=attData[date]||{};
  const p=Object.values(dayRec).filter(v=>v==='P').length;
  const a=Object.values(dayRec).filter(v=>v==='A').length;
  const l=Object.values(dayRec).filter(v=>v==='L').length;
  showToast(`✅ Attendance for ${date} — P:${p} A:${a} L:${l}`,'success');
}

// Attendance Report
/** Renders the monthly attendance report table: one row per (optionally batch-filtered)
 * student, one column per day that has any attendance data in the selected month, plus P/A
 * totals and an attendance percentage. */
function renderAttReport(){
  const students=DB.get('mv_students',[]);
  const attData=DB.get('mv_attendance',{});
  const batchSel=document.getElementById('attReportBatch').value;
  const monthSel=document.getElementById('attReportMonth').value;

  let filtered=students;
  if(batchSel) filtered=students.filter(s=>s.batch===batchSel);

  // Get all dates for selected month
  const allDates=Object.keys(attData).filter(d=>d.startsWith(monthSel)).sort();

  const head=document.getElementById('attReportHead');
  head.innerHTML='<th style="padding:8px 10px;font-weight:700;color:var(--muted);background:var(--bg);border-bottom:1.5px solid var(--border);">Student</th>'+
    allDates.map(d=>`<th style="padding:8px 6px;font-weight:700;color:var(--muted);background:var(--bg);border-bottom:1.5px solid var(--border);text-align:center;">${d.slice(8)}</th>`).join('')+
    '<th style="padding:8px 10px;font-weight:700;color:var(--muted);background:var(--bg);border-bottom:1.5px solid var(--border);text-align:center;">P</th>'+
    '<th style="padding:8px 10px;font-weight:700;color:var(--muted);background:var(--bg);border-bottom:1.5px solid var(--border);text-align:center;">A</th>'+
    '<th style="padding:8px 10px;font-weight:700;color:var(--muted);background:var(--bg);border-bottom:1.5px solid var(--border);text-align:center;">%</th>';

  const body=document.getElementById('attReportBody');
  if(!filtered.length||!allDates.length){
    body.innerHTML='<tr><td colspan="20" style="text-align:center;padding:24px;color:var(--muted);">No attendance data for this period.</td></tr>';
    return;
  }

  body.innerHTML=filtered.map(s=>{
    let p=0,a=0,l=0;
    const cells=allDates.map(d=>{
      const v=(attData[d]||{})[s.id]||'-';
      if(v==='P')p++;else if(v==='A')a++;else if(v==='L')l++;
      return `<td style="text-align:center;border-bottom:1px solid var(--border);"><span class="att-hist-dot ${v}">${v}</span></td>`;
    }).join('');
    const total=p+a+l;
    const pct=total>0?Math.round(p/total*100):'-';
    return `<tr>
      <td style="font-weight:600;padding:8px 10px;border-bottom:1px solid var(--border);">${s.name}<br><small style="color:var(--muted);font-size:10px;">${s.regNo||''}</small></td>
      ${cells}
      <td style="text-align:center;font-weight:700;color:var(--green);border-bottom:1px solid var(--border);">${p}</td>
      <td style="text-align:center;font-weight:700;color:var(--red);border-bottom:1px solid var(--border);">${a}</td>
      <td style="text-align:center;font-weight:800;border-bottom:1px solid var(--border);color:${typeof pct==='number'&&pct<75?'var(--red)':'var(--green)'};">${pct}${typeof pct==='number'?'%':''}</td>
    </tr>`;
  }).join('');
}

/** Sets up the Attendance Report page: populates the batch filter and a rolling 12-month
 * dropdown (most recent first), then renders the report for the default month. */
function initAttReport(){
  const students=DB.get('mv_students',[]);
  const courses=DB.get('mv_courses',[]);
  const batches=new Set();
  students.forEach(s=>{ if(s.batch) batches.add(s.batch); });
  const bSel=document.getElementById('attReportBatch');
  bSel.innerHTML='<option value="">All Batches</option>'+[...batches].map(b=>`<option value="${b}">${b}</option>`).join('');

  const mSel=document.getElementById('attReportMonth');
  const now=new Date();
  mSel.innerHTML='';
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const val=d.toISOString().slice(0,7);
    const lbl=d.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    const o=document.createElement('option'); o.value=val; o.textContent=lbl; if(i===0)o.selected=true;
    mSel.appendChild(o);
  }
  renderAttReport();
}

// ══════════════════════════════════════════
//  ID CARD GENERATOR
// ══════════════════════════════════════════
