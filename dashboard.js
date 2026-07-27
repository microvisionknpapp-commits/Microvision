let dashCharts={};
/** Builds the whole Dashboard page: header date, stat cards
 * (collected/receipts/students/dues), the recent-receipts table, and hands off to
 * renderDashCharts() for the graphs. */
function renderDashboard(){
  document.getElementById('dashDate').textContent=new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const receipts=DB.get('mv_receipts',[]);
  const students=DB.get('mv_students',[]);
  const active=receipts.filter(r=>r.status==='active');
  const totalCollected=active.reduce((s,r)=>s+r.grandTotal,0);
  const todayStr=today();
  const todayAmt=active.filter(r=>r.date===todayStr).reduce((s,r)=>s+r.grandTotal,0);

  // Dues from students (totalFee - feesPaid)
  const studentDue=students.filter(s=>s.courseStatus!=='completed')
    .reduce((s,stu)=>s+Math.max(0,(stu.totalFee||0)-(stu.feesPaid||0)),0);

  // Dues from receipts with a next instalment date set
  // Build set of student names already tracked in students DB
  const trackedNames=new Set(students.map(s=>s.name.toLowerCase()));
  const receiptDueStudents=new Set();
  active.forEach(r=>{
    const hasNextDue=(r.nextInstDate&&r.nextInstDate.trim())||
                     (r.nextInstMonth&&r.nextInstMonth.trim())||
                     (r.nextInstYear&&r.nextInstYear.trim());
    if(hasNextDue && !trackedNames.has(r.studentName.toLowerCase())){
      receiptDueStudents.add(r.studentName.toLowerCase());
    }
  });

  // Count receipts-only dues (students not in DB but have next instalment)
  const receiptOnlyDueCount=receiptDueStudents.size;
  const totalDue=studentDue;
  const totalDueCount=students.filter(s=>s.courseStatus!=='completed'&&(s.totalFee||0)>(s.feesPaid||0)).length + receiptOnlyDueCount;

  document.getElementById('statsGrid').innerHTML=
    statCard('💰','Total Collected',fmtFull(totalCollected),'blue','All time')+
    statCard('📄','Total Receipts',active.length,'green','Active receipts')+
    statCard('👥','Students',students.filter(s=>s.courseStatus!=='completed').length,'orange','Ongoing')+
    statCard('⚠️','Fee Dues',totalDueCount+' students'+(totalDue>0?' · '+fmtFull(totalDue):''),'red','Pending instalments');

  // Recent receipts
  const tbody=document.getElementById('recentTbody');
  if(!active.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">No receipts yet</td></tr>'; }
  else{
    tbody.innerHTML=active.slice(0,8).map(r=>{
      const hasNext=(r.nextInstDate&&r.nextInstDate.trim())||(r.nextInstMonth&&r.nextInstMonth.trim());
      const dueTag=hasNext?`<span class="badge" style="background:#fef3c7;color:#92400e;margin-left:4px;font-size:9px;">📅 Due</span>`:'';
      return `<tr>
        <td><strong>${r.receiptNo}</strong></td>
        <td>${r.studentName}${dueTag}</td>
        <td>${r.date}</td>
        <td style="font-weight:700;color:var(--green)">${fmtFull(r.grandTotal)}</td>
        <td><span class="badge badge-blue">${r.paymentMode.toUpperCase()}</span></td>
        <td><span class="badge ${r.status==='active'?'badge-green':'badge-red'}">${r.status}</span></td>
      </tr>`;
    }).join('');
  }

  // Charts
  renderDashCharts(active);
  updateDuesBadge();
}
/** Returns the HTML for one stat-grid card (icon, big value, label, small sub-caption) — a
 * tiny template helper used 4x by renderDashboard(). */
function statCard(icon,label,value,color,sub){
  return `<div class="stat-card ${color}"><div class="stat-icon">${icon}</div>
    <div class="stat-value">${value}</div><div class="stat-label">${label}</div>
    <div class="stat-change">${sub}</div></div>`;
}
/** Draws the two Chart.js dashboards: a monthly bar chart of collections (Jan–Dec) and a
 * doughnut + bar breakdown of revenue by course/program. Destroys any previous chart
 * instance first so re-renders don't stack. */
function renderDashCharts(receipts){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthly=Array(12).fill(0);
  receipts.forEach(r=>{
    const parts=r.date.split('/');
    if(parts.length>=2){ const m=parseInt(parts[1])-1; if(m>=0&&m<12) monthly[m]+=r.grandTotal; } // date is DD/MM/YY — parts[1] is the month
  });

  if(dashCharts.monthly){ dashCharts.monthly.destroy(); }
  const mc=document.getElementById('monthlyChart');
  if(mc){
    dashCharts.monthly=new Chart(mc,{type:'bar',data:{labels:months,datasets:[{label:'Collections',data:monthly,backgroundColor:'rgba(37,99,235,.7)',borderRadius:6}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'₹'+v.toLocaleString('en-IN')}}}}});
  }

  // Course chart + bars
  const courseMap={};
  receipts.forEach(r=>{ const k=r.program||'Other'; courseMap[k]=(courseMap[k]||0)+r.grandTotal; });
  const ckeys=Object.keys(courseMap); const cvals=ckeys.map(k=>courseMap[k]);
  const totalAll=cvals.reduce((a,b)=>a+b,0);
  const colors=['rgba(37,99,235,.8)','rgba(22,163,74,.8)','rgba(234,88,12,.8)','rgba(220,38,38,.8)','rgba(217,119,6,.8)'];
  if(dashCharts.course){ dashCharts.course.destroy(); }
  const cc=document.getElementById('courseChart');
  if(cc&&ckeys.length){
    dashCharts.course=new Chart(cc,{type:'doughnut',data:{labels:ckeys,datasets:[{data:cvals,backgroundColor:colors.slice(0,ckeys.length),borderWidth:2}]},
      options:{responsive:true,plugins:{legend:{position:'bottom'}}}});
  }
  // Course revenue bars (App 2 style)
  const barsEl=document.getElementById('courseBars');
  if(barsEl&&ckeys.length){
    barsEl.style.display='block';
    barsEl.innerHTML=ckeys.map((k,i)=>{
      const pct=totalAll>0?Math.round((courseMap[k]/totalAll)*100):0;
      return `<div class="course-bar-item">
        <div class="cb-label"><span>${k}</span><span style="font-weight:700;">₹${courseMap[k].toLocaleString('en-IN')}</span></div>
        <div class="cb-track"><div class="cb-fill" style="width:${pct}%;background:${colors[i%colors.length].replace('.8','1')}"></div></div>
      </div>`;
    }).join('');
  }
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
