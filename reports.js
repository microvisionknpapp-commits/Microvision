let reportCharts={};
/** Builds the whole Reports page: revenue stat cards (total/cash/UPI/this-month), a
 * monthly breakdown table, and 4 Chart.js graphs (30-day daily trend, payment-mode split,
 * monthly bar, revenue-by-course) — destroying any previous chart instances first so
 * re-renders don't leak/stack. */
function renderReports(){
  const receipts=DB.get('mv_receipts',[]).filter(r=>r.status==='active');
  const total=receipts.reduce((s,r)=>s+r.grandTotal,0);
  const cashTotal=receipts.filter(r=>r.paymentMode==='cash').reduce((s,r)=>s+r.grandTotal,0);
  const upiTotal=receipts.filter(r=>r.paymentMode==='upi').reduce((s,r)=>s+r.grandTotal,0);
  const thisMonth=new Date().getMonth()+1;
  const thisMonthTotal=receipts.filter(r=>{ const p=r.date.split('/'); return parseInt(p[1])===thisMonth; }).reduce((s,r)=>s+r.grandTotal,0);

  document.getElementById('reportStats').innerHTML=
    statCard('💰','Total Revenue',fmtFull(total),'blue','All receipts')+
    statCard('💵','Cash Collections',fmtFull(cashTotal),'green','Cash payments')+
    statCard('📱','UPI Collections',fmtFull(upiTotal),'orange','UPI payments')+
    statCard('📅','This Month',fmtFull(thisMonthTotal),'red','Current month');

  // Monthly breakdown table
  const monthMap={};
  receipts.forEach(r=>{
    const p=r.date.split('/'); if(p.length<3)return;
    const key=p[2]+'-'+(p[1]||'');
    if(!monthMap[key])monthMap[key]={count:0,cash:0,upi:0,cheque:0,split:0,total:0};
    monthMap[key].count++;
    monthMap[key][r.paymentMode]=(monthMap[key][r.paymentMode]||0)+r.grandTotal;
    monthMap[key].total+=r.grandTotal;
  });
  const months=Object.keys(monthMap).sort().reverse();
  const tbody=document.getElementById('reportTbody');
  tbody.innerHTML=months.map(m=>{
    const d=monthMap[m];
    return `<tr><td>${m}</td><td>${d.count}</td><td>${fmtFull(d.cash)}</td><td>${fmtFull(d.upi)}</td><td>${fmtFull(d.cheque)}</td><td>${fmtFull(d.split)}</td><td><strong>${fmtFull(d.total)}</strong></td></tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px;">No data yet</td></tr>';

  // Daily chart (last 30 days)
  const daily={}; const now=new Date();
  for(let i=29;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); daily[d.toLocaleDateString('en-IN')]=0; }
  receipts.forEach(r=>{ const p=r.date.split('/'); if(p.length<3)return; const k=p[0]+'/'+p[1]+'/20'+p[2]; const d=new Date(k); const label=d.toLocaleDateString('en-IN'); if(label in daily)daily[label]+=r.grandTotal; });
  const dkeys=Object.keys(daily); const dvals=dkeys.map(k=>daily[k]);

  Object.values(reportCharts).forEach(c=>{ try{c.destroy();}catch(e){} }); reportCharts={};

  const dc=document.getElementById('dailyChart');
  if(dc) reportCharts.daily=new Chart(dc,{type:'line',data:{labels:dkeys.map(k=>k.slice(0,5)),datasets:[{label:'Daily',data:dvals,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.1)',fill:true,tension:.4,pointRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'₹'+v.toLocaleString('en-IN')}}}}});

  // Mode pie
  const modeTotals={Cash:cashTotal,UPI:upiTotal,Cheque:receipts.filter(r=>r.paymentMode==='cheque').reduce((s,r)=>s+r.grandTotal,0),Split:receipts.filter(r=>r.paymentMode==='split').reduce((s,r)=>s+r.grandTotal,0)};
  const mc2=document.getElementById('modeChart');
  if(mc2) reportCharts.mode=new Chart(mc2,{type:'doughnut',data:{labels:Object.keys(modeTotals),datasets:[{data:Object.values(modeTotals),backgroundColor:['#16a34a','#2563eb','#ea580c','#7c3aed'],borderWidth:2}]},options:{responsive:true,plugins:{legend:{position:'bottom'}}}});

  // Monthly bar
  const mLabels=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mData=Array(12).fill(0);
  receipts.forEach(r=>{ const p=r.date.split('/'); if(p.length>=2){ const m=parseInt(p[1])-1; if(m>=0&&m<12)mData[m]+=r.grandTotal; }});
  const mc3=document.getElementById('monthChart2');
  if(mc3) reportCharts.month=new Chart(mc3,{type:'bar',data:{labels:mLabels,datasets:[{label:'Monthly Revenue',data:mData,backgroundColor:'rgba(22,163,74,.7)',borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'₹'+v.toLocaleString('en-IN')}}}}});

  // Course revenue
  const courseMap={};
  receipts.forEach(r=>{ const k=r.program||'Other'; courseMap[k]=(courseMap[k]||0)+r.grandTotal; });
  const ckeys=Object.keys(courseMap); const cvals=ckeys.map(k=>courseMap[k]);
  const cc2=document.getElementById('courseChart2');
  if(cc2&&ckeys.length) reportCharts.course=new Chart(cc2,{type:'bar',data:{labels:ckeys,datasets:[{label:'Revenue',data:cvals,backgroundColor:'rgba(37,99,235,.7)',borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'₹'+v.toLocaleString('en-IN')}}}}});
}

/** Exports a two-sheet .xlsx: a 'Monthly Report' summary (receipts count + totals per
 * payment mode per month) and an 'All Receipts' raw listing. */
function exportReportExcel(){
  const receipts=DB.get('mv_receipts',[]).filter(r=>r.status==='active');
  if(!receipts.length){ showToast('No data to export','error'); return; }
  const monthMap={};
  receipts.forEach(r=>{
    const p=r.date.split('/'); if(p.length<3)return;
    const key=p[2]+'-'+p[1];
    if(!monthMap[key])monthMap[key]={Month:key,Receipts:0,Cash:0,UPI:0,Cheque:0,Split:0,Total:0};
    monthMap[key].Receipts++;
    const m=r.paymentMode.charAt(0).toUpperCase()+r.paymentMode.slice(1);
    monthMap[key][m]=(monthMap[key][m]||0)+r.grandTotal;
    monthMap[key].Total+=r.grandTotal;
  });
  const ws=XLSX.utils.json_to_sheet(Object.values(monthMap));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Monthly Report');
  const ws2=XLSX.utils.json_to_sheet(receipts.map(r=>({'Receipt No':r.receiptNo,Date:r.date,Student:r.studentName,Course:r.program,Amount:r.grandTotal,Mode:r.paymentMode})));
  XLSX.utils.book_append_sheet(wb,ws2,'All Receipts');
  XLSX.writeFile(wb,'Microvision_Report_'+Date.now()+'.xlsx');
  showToast('Report exported!','success');
}

// ══════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════
