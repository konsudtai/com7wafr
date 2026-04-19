/* ================ PAGES — Real API Integration ================ */
window.PAGES = (() => {
  const D = window.DATA;

  // ---------- helpers ----------
  const sevBadge = s => `<span class="badge badge--${({CRITICAL:'crit',HIGH:'high',MEDIUM:'med',LOW:'low',INFORMATIONAL:'info'})[s]||'info'}">${s}</span>`;
  const money = n => '$' + (n||0).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const heatColor = v => { const hue = 30 + (1-v)*80; return `hsl(${hue} 65% ${92-v*45}%)`; };

  function ph({eyebrow, title, sub, actions=''}) {
    return `<section class="ph"><div><div class="ph__eyebrow">${eyebrow}</div><h1 class="display">${title}</h1>${sub?`<p class="ph__sub">${sub}</p>`:''}</div><div class="ph__meta">${actions}</div></section>`;
  }

  function empty(msg) { return `<div class="empty"><h3>${msg}</h3><p>Run a scan first to see data here.</p></div>`; }

  // ==================== OVERVIEW ====================
  function overview() {
    if (!D.findings.length) return empty('No scan data yet');
    const totals = D.accounts.reduce((a,x)=>({crit:a.crit+x.critical,high:a.high+x.high,med:a.med+x.medium,low:a.low+x.low,info:a.info+x.info}),{crit:0,high:0,med:0,low:0,info:0});
    const total = totals.crit+totals.high+totals.med+totals.low+totals.info;
    const avgScore = D.pillars.length ? Math.round(D.pillars.reduce((a,p)=>a+p.score,0)/D.pillars.length) : 0;

    // Radar SVG
    const N=D.pillars.length||5, R=110, CX=130, CY=130;
    const pts = D.pillars.map((p,i)=>{ const a=-Math.PI/2+(Math.PI*2*i/N); const r=R*(p.score/100); return [CX+Math.cos(a)*r, CY+Math.sin(a)*r]; });
    const gridRings = [0.25,0.5,0.75,1].map(f=>{ const ring=D.pillars.map((_,i)=>{ const a=-Math.PI/2+(Math.PI*2*i/N); return [CX+Math.cos(a)*R*f, CY+Math.sin(a)*R*f]; }); return `<polygon points="${ring.map(p=>p.join(',')).join(' ')}" fill="none" stroke="var(--line-2)" stroke-width="1"/>`; }).join('');
    const spokes = D.pillars.map((p,i)=>{ const a=-Math.PI/2+(Math.PI*2*i/N); const x=CX+Math.cos(a)*R, y=CY+Math.sin(a)*R; const lx=CX+Math.cos(a)*(R+18), ly=CY+Math.sin(a)*(R+18); return `<line x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" stroke="var(--line-2)" stroke-width="1"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="9.5" fill="var(--text-3)">${p.id}</text>`; }).join('');
    const area = pts.length ? `<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="color-mix(in oklab, var(--ac-500) 22%, transparent)" stroke="var(--ac-500)" stroke-width="1.8"/>` : '';
    const dots = pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--ac-500)"/>`).join('');

    // Heatmap — real data
    const heatServices = D.services.slice(0,8);
    const heatMax = Math.max(1, ...D.findings.map(()=>1));
    const heatRows = heatServices.map(s => {
      const cells = D.pillars.map(p => {
        const count = D.findings.filter(f => f.service === s && f.pillar === p.name).length;
        const v = Math.min(1, count / Math.max(1, total/D.pillars.length/heatServices.length * 3));
        return `<div class="heat__cell" style="background:${count>0?heatColor(v):'var(--surface)'}">${count||''}</div>`;
      }).join('');
      return `<div class="heat__row-label">${s}</div>${cells}`;
    }).join('');

    // Compliance summary
    const fwCards = D.frameworks.map(f => {
      const pct = f.controls > 0 ? Math.round(f.passed/f.controls*100) : 0;
      return `<div class="card" style="padding:16px; text-align:center;">
        <div class="t3" style="font-size:10px; letter-spacing:.1em; text-transform:uppercase">${f.id}</div>
        <div style="font-family:var(--font-display); font-size:32px; color:${pct>=75?'var(--s-low)':pct>=50?'var(--s-med)':'var(--s-crit)'}">${pct}%</div>
        <div class="t3" style="font-size:11px">${f.name}</div>
      </div>`;
    }).join('');

    return `
      ${ph({ eyebrow:'Monitor · Overview', title:`Your cloud, <em>at a glance.</em>`, sub:`${D.accounts.length} AWS account(s) · ${total} findings · ${D.services.length} services scanned` })}

      <div class="grid grid-4 mb-24">
        <div class="kpi"><div class="kpi__label">Overall Score</div><div class="kpi__val">${avgScore}</div></div>
        <div class="kpi"><div class="kpi__label">Total Findings</div><div class="kpi__val">${total}</div></div>
        <div class="kpi"><div class="kpi__label">Critical + High</div><div class="kpi__val" style="color:var(--s-crit)">${totals.crit+totals.high}</div></div>
        <div class="kpi"><div class="kpi__label">Accounts</div><div class="kpi__val">${D.accounts.length}</div></div>
      </div>

      <div class="grid grid-5 mb-24">
        ${D.pillars.map(p => `<div class="pillar"><div class="pillar__head"><span class="pillar__name">${p.name}</span><span class="pillar__score" style="color:${p.score>=75?'var(--s-low)':p.score>=60?'var(--s-med)':'var(--s-crit)'}">${p.score}</span></div><div class="pillar__bar"><span style="width:${p.score}%;background:${p.score>=75?'var(--s-low)':p.score>=60?'var(--s-med)':'var(--s-crit)'}"></span></div><div class="pillar__sev"><span><span class="sq sq--crit"></span> <b>${p.crit}</b></span><span><span class="sq sq--high"></span> <b>${p.high}</b></span><span><span class="sq sq--med"></span> <b>${p.med}</b></span><span><span class="sq sq--low"></span> <b>${p.low}</b></span></div></div>`).join('')}
      </div>

      <div class="grid grid-2 mb-24">
        <div class="card"><div class="card__head"><h3>Pillar Radar</h3></div><div class="radar"><svg viewBox="0 0 260 260">${gridRings}${spokes}${area}${dots}</svg></div></div>
        <div class="card"><div class="card__head"><h3>Service x Pillar</h3></div><div class="heat"><div></div>${D.pillars.map(p=>`<div class="heat__col-label">${p.id}</div>`).join('')}${heatRows}</div></div>
      </div>

      ${D.frameworks.length ? `<h3 class="mb-16" style="font-family:var(--font-display)">Compliance Frameworks</h3><div class="grid grid-4 mb-24">${fwCards}</div>` : ''}

      <div class="card card--flush mb-24">
        <div class="card__head" style="padding:20px 24px 0"><h3>Account Summary</h3><a href="#accounts" class="btn btn--sm btn--ghost" data-route="accounts">Manage →</a></div>
        <table class="tbl"><thead><tr><th>Alias</th><th>Account ID</th><th>Critical</th><th>High</th><th>Medium</th><th>Total</th></tr></thead>
        <tbody>${D.accounts.map(a=>`<tr><td><strong>${a.alias}</strong></td><td class="mono">${a.id}</td><td>${sevBadge('CRITICAL')} ${a.critical}</td><td>${sevBadge('HIGH')} ${a.high}</td><td>${sevBadge('MEDIUM')} ${a.medium}</td><td><strong>${a.critical+a.high+a.medium+a.low+a.info}</strong></td></tr>`).join('')}</tbody></table>
      </div>
    `;
  }

  // ==================== FINDINGS ====================
  function findings() {
    if (!D.findings.length) return empty('No findings yet');
    const uniq = k => [...new Set(D.findings.map(f=>f[k]).filter(Boolean))].sort();
    const rows = D.findings.map(f => `
      <tr data-id="${f.id}">
        <td class="mono" style="font-size:12px">${f.id.slice(0,12)}</td>
        <td>${f.service}</td>
        <td class="mono" style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.resource}</td>
        <td>${f.pillar}</td>
        <td>${sevBadge(f.severity)}</td>
        <td>${f.title}</td>
        <td><span class="chip">${f.account}</span></td>
      </tr>`).join('');

    return `
      ${ph({ eyebrow:'Monitor · Findings', title:`All the signals, <em>ranked.</em>`, sub:`${D.findings.length} findings across ${D.accounts.length} accounts` })}
      <div class="card card--flush">
        <div class="filters">
          <input type="text" id="f-search" placeholder="Search resource, title..." />
          <select id="f-pillar"><option value="">All pillars</option>${uniq('pillar').map(p=>`<option>${p}</option>`).join('')}</select>
          <select id="f-sev"><option value="">All severities</option>${['CRITICAL','HIGH','MEDIUM','LOW','INFORMATIONAL'].map(s=>`<option>${s}</option>`).join('')}</select>
          <select id="f-svc"><option value="">All services</option>${uniq('service').map(s=>`<option>${s}</option>`).join('')}</select>
          <select id="f-acct"><option value="">All accounts</option>${uniq('account').map(s=>`<option>${s}</option>`).join('')}</select>
          <div class="filters__sep"></div>
          <span class="chip" id="f-count">${D.findings.length} results</span>
        </div>
        <table class="tbl"><thead><tr><th>ID</th><th>Service</th><th>Resource</th><th>Pillar</th><th>Severity</th><th>Title</th><th>Account</th></tr></thead>
        <tbody id="findings-tbody">${rows}</tbody></table>
      </div>
      <div class="drawer" id="drawer"><div class="drawer__bd" data-drawer-close></div><div class="drawer__box"><button class="icon-btn drawer__close" data-drawer-close>x</button><div id="drawer-body"></div></div></div>
    `;
  }

  // ==================== COMPLIANCE ====================
  function compliance() {
    if (!D.frameworks.length) return empty('No compliance data');

    const cards = D.frameworks.map(f => {
      const pct = f.controls>0 ? Math.round(f.passed/f.controls*100) : 0;
      const needAttn = (f.details||[]).filter(d=>d.status==='Need Attention').length;
      const compliant = (f.details||[]).filter(d=>d.status==='Compliant').length;
      const na = (f.details||[]).filter(d=>d.status==='N/A').length;
      return `<button class="card fw-tab" data-fw="${f.id}" style="cursor:pointer; text-align:left; transition:outline .14s; outline:2px solid transparent;">
        <div class="flex between center mb-8"><div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase">${f.id.toUpperCase()}</div><span class="badge badge--outline">${f.controls} controls</span></div>
        <h3 style="font-size:15px;">${f.name}</h3>
        <div class="flex gap-16 center mt-16 mb-12"><div style="font-family:var(--font-display); font-size:38px; line-height:1; color:${pct>=80?'var(--s-low)':pct>=50?'var(--s-med)':'var(--s-crit)'}">${pct}<span style="font-size:16px; color:var(--text-3)">%</span></div></div>
        <div class="pillar__bar mb-8"><span style="width:${pct}%;background:${pct>=80?'var(--s-low)':pct>=70?'var(--s-med)':'var(--s-crit)'}"></span></div>
        <div class="flex gap-8" style="font-size:11px;"><span style="color:var(--s-low)">Compliant: ${compliant}</span><span style="color:var(--s-crit)">Need Attention: ${needAttn}</span><span class="t3">N/A: ${na}</span></div>
      </button>`;
    }).join('');

    // Detail panels grouped by Category like Service Screener
    const panels = D.frameworks.map(f => {
      const details = f.details || [];
      const categories = {};
      details.forEach(d => { (categories[d.category] ||= []).push(d); });
      const needAttn = details.filter(d=>d.status==='Need Attention').length;
      const compliant = details.filter(d=>d.status==='Compliant').length;
      const na = details.filter(d=>d.status==='N/A').length;

      return `<div class="fw-panel" id="fw-panel-${f.id}" style="display:none;">
        <div class="card mb-16">
          <div class="flex between center mb-8">
            <div><div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-500);">${f.id.toUpperCase()}</div><h3>${f.name}</h3></div>
            <div class="flex gap-16" style="font-size:13px;"><span style="color:var(--s-low)">Compliant: <b>${compliant}</b></span><span style="color:var(--s-crit)">Need Attention: <b>${needAttn}</b></span><span class="t3">N/A: <b>${na}</b></span></div>
          </div>
          ${f.desc ? '<p class="t2" style="font-size:13px;">' + f.desc + '</p>' : ''}
          <div class="flex gap-8 mt-16">
            <button class="btn btn--sm fw-filter active" data-filter="all">All (${details.length})</button>
            <button class="btn btn--sm btn--ghost fw-filter" data-filter="Need Attention">Need Attention (${needAttn})</button>
            <button class="btn btn--sm btn--ghost fw-filter" data-filter="Compliant">Compliant (${compliant})</button>
            <button class="btn btn--sm btn--ghost fw-filter" data-filter="N/A">N/A (${na})</button>
          </div>
        </div>
        <div class="card card--flush">
          <table class="tbl"><thead><tr><th>Category</th><th>Rule ID</th><th>Status</th><th>Description</th><th>Resources / Reference</th></tr></thead>
          <tbody class="fw-tbody">
            ${Object.entries(categories).map(([cat, items]) => items.map((d,i) => `<tr data-status="${d.status}">
              ${i===0 ? '<td rowspan="'+items.length+'" style="vertical-align:top; font-weight:500; background:var(--surface); border-right:1px solid var(--line);">'+cat+'</td>' : ''}
              <td class="mono" style="font-size:12px;">${d.id}</td>
              <td><span class="badge badge--${d.status==='Compliant'?'low':d.status==='Need Attention'?'crit':'info'}">${d.status}</span></td>
              <td>${d.title}${d.severity ? ' ' + sevBadge(d.severity) : ''}${d.recommendation ? '<div class="t2 mt-8" style="font-size:12px;">' + d.recommendation + '</div>' : ''}</td>
              <td style="font-size:11.5px; color:var(--text-3); max-width:200px; word-break:break-all;">${d.resources || '—'}</td>
            </tr>`).join('')).join('')}
          </tbody></table>
        </div>
      </div>`;
    }).join('');

    return `
      ${ph({ eyebrow:'Monitor · Compliance', title:`Benchmarks, <em>side by side.</em>`, sub:'Click a framework to see Category → Rule ID detail (Service Screener style)' })}
      <div class="grid grid-3 mb-24" id="fw-cards">${cards}</div>
      <div id="fw-panels">${panels}</div>
    `;
  }

  // ==================== HISTORY ====================
  function history() {
    if (!D.history.length) return empty('No scan history');
    return `
      ${ph({ eyebrow:'Monitor · History', title:`Trends over <em>time.</em>`, sub:`${D.history.length} scans recorded` })}
      <div class="card card--flush">
        <table class="tbl"><thead><tr><th>Date</th><th>Scan ID</th><th>Status</th></tr></thead>
        <tbody>${D.history.map(h=>`<tr><td class="mono">${h.date}</td><td class="mono">${(h.scanId||'').slice(0,12)}</td><td><span class="badge badge--${h.status==='COMPLETED'?'low':h.status==='FAILED'?'crit':'info'}">${h.status}</span></td></tr>`).join('')}</tbody></table>
      </div>
    `;
  }

  // ==================== INVESTIGATE (CloudTrail) ====================
  function investigate() {
    const accts = D.accounts.length ? D.accounts : [{id:'',alias:'No accounts'}];
    const defaultRegion = (window.WA_CONFIG && window.WA_CONFIG.REGION) || 'ap-southeast-1';
    const regions = ['ap-southeast-1','us-east-1','us-west-2','eu-west-1','ap-northeast-1','eu-central-1'];

    return `
      ${ph({ eyebrow:'Monitor · Investigate', title:`CloudTrail <em>forensics.</em>`, sub:'Query CloudTrail events for security investigation and audit' })}
      <div class="grid grid-2 mb-24" style="grid-template-columns:1fr 2fr;">
        <div class="card">
          <h3 class="mb-16">Query</h3>
          <div style="margin-bottom:12px;">
            <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Account</label>
            <select id="inv-acct" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:13px;">
              ${accts.map(a => '<option value="' + a.id + '">' + (a.alias||a.id) + ' (' + a.id + ')</option>').join('')}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Region</label>
            <select id="inv-region" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:13px;">
              ${regions.map(r => '<option value="' + r + '"' + (r===defaultRegion?' selected':'') + '>' + r + '</option>').join('')}
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Time Range</label>
            <select id="inv-time" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:13px;">
              <option value="1">Last 1 hour</option>
              <option value="6">Last 6 hours</option>
              <option value="24" selected>Last 24 hours</option>
              <option value="72">Last 3 days</option>
              <option value="168">Last 7 days</option>
              <option value="720">Last 30 days</option>
            </select>
          </div>
          <div style="margin-bottom:12px;">
            <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Username (optional)</label>
            <input type="text" id="inv-user" placeholder="e.g. admin, root" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:13px;">
          </div>
          <div style="margin-bottom:12px;">
            <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Event Name (optional)</label>
            <input type="text" id="inv-event" placeholder="e.g. ConsoleLogin, RunInstances" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:13px;">
          </div>
          <div style="margin-bottom:16px;">
            <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Max Results</label>
            <select id="inv-max" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:13px;">
              <option value="25">25</option><option value="50" selected>50</option><option value="100">100</option><option value="200">200</option>
            </select>
          </div>
          <button class="btn btn--accent" id="btn-investigate" style="width:100%;">Search Events</button>
          <div class="t3 mt-16" style="font-size:11px; line-height:1.6;">
            Suspicious events are auto-flagged:<br>
            <span style="color:var(--s-crit);">Alert</span> — Root activity, failed logins, terminate/delete<br>
            <span style="color:var(--s-med);">Warning</span> — IAM changes, SG changes, access denied
          </div>
        </div>
        <div>
          <div id="inv-summary" style="display:none;" class="mb-16"></div>
          <div class="card card--flush" id="inv-results">
            <div style="padding:40px; text-align:center; color:var(--text-3);">
              <p>Select an account and click "Search Events" to query CloudTrail.</p>
              <p class="t3 mt-8" style="font-size:12px;">CloudTrail stores management events for the last 90 days.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== ACCOUNTS (with real CRUD) ====================
  function accounts() {
    const platformId = (window.WA_CONFIG && window.WA_CONFIG.PLATFORM_ACCOUNT_ID) || '';
    return `
      ${ph({ eyebrow:'Manage · Accounts', title:`AWS fleet, <em>connected.</em>`, sub:'Add AWS accounts via IAM role for cross-account scanning', actions:`<button class="btn btn--accent btn--sm" id="btn-add-acct">+ Add account</button>` })}
      <div class="grid grid-3 mb-24" id="acct-cards">
        ${D.accounts.map(a => `<div class="card">
          <div class="flex between center mb-16"><div><h3 style="margin-bottom:4px">${a.alias}</h3><div class="mono t3" style="font-size:12px">${a.id}</div></div><span class="badge badge--outline">${a.env||'Unknown'}</span></div>
          <div class="flex gap-8 wrap" style="font-size:12px"><span class="t3">C <b style="color:var(--s-crit)">${a.critical}</b></span><span class="t3">H <b style="color:var(--s-high)">${a.high}</b></span><span class="t3">M <b style="color:var(--s-med)">${a.medium}</b></span><span class="t3">L <b style="color:var(--s-low)">${a.low}</b></span></div>
          <div class="flex gap-8 mt-16"><button class="btn btn--sm btn-verify" data-id="${a.id}">Verify</button><button class="btn btn--sm btn--ghost btn-delete" data-id="${a.id}">Delete</button></div>
        </div>`).join('')}
        <button class="card" id="btn-add-acct2" style="border:1.5px dashed var(--line-2); background:transparent; min-height:180px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--text-3); cursor:pointer">
          <svg width="36" height="36" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <span>Add AWS account</span>
        </button>
      </div>
    `;
  }

  // AWS service icon SVGs (simplified official icons, 20x20)
  const svcIcon = {
    'EC2':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#ED7100"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#F09000"/><rect x="14" y="14" width="12" height="12" rx="1" fill="#fff"/></svg>',
    'S3':           '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 2L4 10v20l16 8 16-8V10L20 2z" fill="#3F8624"/><path d="M20 6l-12 6v16l12 6 12-6V12L20 6z" fill="#6CAE3E"/><path d="M14 18h12v8H14z" fill="#fff"/></svg>',
    'RDS':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#2E27AD"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#527FFF"/><ellipse cx="20" cy="16" rx="8" ry="3" fill="#fff"/><path d="M12 16v8c0 1.7 3.6 3 8 3s8-1.3 8-3v-8" fill="none" stroke="#fff" stroke-width="1.5"/></svg>',
    'IAM':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><circle cx="20" cy="16" r="4" fill="#fff"/><path d="M13 26c0-3.9 3.1-7 7-7s7 3.1 7 7" fill="none" stroke="#fff" stroke-width="2"/></svg>',
    'Lambda':       '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#C17B11"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#E7A33E"/><path d="M14 28l6-16 6 16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'DynamoDB':     '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#2E27AD"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#527FFF"/><path d="M12 15h16M12 20h16M12 25h16" stroke="#fff" stroke-width="1.5"/></svg>',
    'ELB':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#8C4FFF"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#A166FF"/><circle cx="20" cy="20" r="6" fill="none" stroke="#fff" stroke-width="2"/><path d="M17 20h6M20 17v6" stroke="#fff" stroke-width="1.5"/></svg>',
    'CloudFront':   '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#8C4FFF"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#A166FF"/><circle cx="20" cy="20" r="7" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M13 20h14" stroke="#fff" stroke-width="1.2"/><ellipse cx="20" cy="20" rx="4" ry="7" fill="none" stroke="#fff" stroke-width="1.2"/></svg>',
    'ECS':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#ED7100"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#F09000"/><rect x="13" y="13" width="6" height="6" rx="1" fill="#fff"/><rect x="21" y="13" width="6" height="6" rx="1" fill="#fff"/><rect x="17" y="21" width="6" height="6" rx="1" fill="#fff"/></svg>',
    'EKS':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#ED7100"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#F09000"/><polygon points="20,12 26,16 26,24 20,28 14,24 14,16" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="20" cy="20" r="2.5" fill="#fff"/></svg>',
    'CloudTrail':   '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><path d="M12 24l4-4 4 4 8-8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'VPC':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#8C4FFF"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#A166FF"/><rect x="12" y="14" width="16" height="12" rx="2" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M20 14v12" stroke="#fff" stroke-width="1" stroke-dasharray="2 2"/></svg>',
    'KMS':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><circle cx="18" cy="18" r="4" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M22 18h6M26 18v4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
    'CloudWatch':   '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><circle cx="20" cy="20" r="7" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M20 15v5l3 3" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
    'Config':       '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><path d="M16 20l3 3 6-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'API Gateway':  '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><path d="M14 16h4l2 4-2 4h-4M26 16h-4l-2 4 2 4h4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'SQS':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><rect x="13" y="15" width="14" height="10" rx="1.5" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M16 18h8M16 22h5" stroke="#fff" stroke-width="1.2"/></svg>',
    'OpenSearch':   '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#2E27AD"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#527FFF"/><circle cx="18" cy="18" r="5" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M22 22l5 5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    'GuardDuty':    '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#BF0816"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#DD344C"/><path d="M20 12v4M20 24v2M15 17l2 2M23 17l-2 2M14 22h3M23 22h3" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><circle cx="20" cy="20" r="2" fill="#fff"/></svg>',
    'EFS':          '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#3F8624"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#6CAE3E"/><rect x="13" y="14" width="14" height="12" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M13 18h14M13 22h14" stroke="#fff" stroke-width="1"/></svg>',
    'ElastiCache':  '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#2E27AD"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#527FFF"/><path d="M14 20h12M20 14v12" stroke="#fff" stroke-width="2"/><circle cx="20" cy="20" r="3" fill="#fff"/></svg>',
    'Redshift':     '<svg viewBox="0 0 40 40" width="18" height="18"><path d="M20 4L4 12v16l16 8 16-8V12L20 4z" fill="#2E27AD"/><path d="M20 8l-12 6v12l12 6 12-6V14L20 8z" fill="#527FFF"/><rect x="14" y="14" width="12" height="12" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M14 18h12M14 22h12M18 14v12M22 14v12" stroke="#fff" stroke-width=".8"/></svg>',
  };
  function svcIconHtml(name) { return svcIcon[name] || '<svg viewBox="0 0 40 40" width="18" height="18"><rect x="8" y="8" width="24" height="24" rx="4" fill="var(--line-2)"/><text x="20" y="24" text-anchor="middle" font-size="12" fill="var(--text-3)">' + name.slice(0,2) + '</text></svg>'; }

  // ==================== SCAN (real execution) ====================
  function scan() {
    const allSvcs = ['EC2','S3','RDS','IAM','Lambda','DynamoDB','ELB','CloudFront','ECS','EKS','CloudTrail','VPC','KMS','CloudWatch','Config','API Gateway','SQS','OpenSearch','GuardDuty','EFS','ElastiCache','Redshift'];
    const allRegions = ['us-east-1','us-east-2','us-west-1','us-west-2','ap-southeast-1','ap-southeast-2','ap-northeast-1','eu-west-1','eu-central-1'];
    const defaultRegion = (window.WA_CONFIG && window.WA_CONFIG.REGION) || 'ap-southeast-1';

    return `
      ${ph({ eyebrow:'Manage · Scan', title:`Run a review, <em>now.</em>`, sub:'Select accounts, regions, and services to scan', actions:`<button class="btn btn--accent" id="btn-start-scan">Start scan</button>` })}
      <div class="grid grid-2 mb-24">
        <div class="card">
          <h3 class="mb-16">Configure</h3>
          <div class="mb-24"><div class="t3 mb-8" style="font-size:11.5px; letter-spacing:.08em; text-transform:uppercase">Accounts</div>
            <div class="flex gap-8 wrap" id="scan-accts">${D.accounts.map(a=>`<label class="chip"><input type="checkbox" name="s-acct" value="${a.id}" checked style="accent-color:var(--ac-500)"/> ${a.alias||a.id}</label>`).join('')}</div>
          </div>
          <div class="mb-24"><div class="t3 mb-8" style="font-size:11.5px; letter-spacing:.08em; text-transform:uppercase">Regions</div>
            <div class="flex gap-8 wrap">${allRegions.map(r=>`<label class="chip"><input type="checkbox" name="s-region" value="${r}" ${r===defaultRegion?'checked':''} style="accent-color:var(--ac-500)"/> <span class="mono">${r}</span></label>`).join('')}</div>
          </div>
          <div class="mb-24"><div class="t3 mb-8" style="font-size:11.5px; letter-spacing:.08em; text-transform:uppercase">Services</div>
            <div class="svc-grid">${allSvcs.map(s=>`<label class="svc-chip"><input type="checkbox" name="s-svc" value="${s.toLowerCase()}" checked style="accent-color:var(--ac-500)"/>${svcIconHtml(s)}<span>${s}</span></label>`).join('')}</div>
          </div>
        </div>
        <div class="card">
          <h3 class="mb-16">Scan Status</h3>
          <div id="scan-status-area">
            <div class="t2">Ready to scan</div>
            <div class="pillar__bar mt-16"><span id="scan-progress" style="width:0%"></span></div>
            <div class="t3 mt-8" id="scan-status-text">Click "Start scan" to begin</div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== TEAM (real Cognito) ====================
  function team() {
    return `
      ${ph({ eyebrow:'Manage · Team', title:`People & <em>permissions.</em>`, sub:'Manage team members via Cognito User Pool', actions:`<button class="btn btn--accent btn--sm" id="btn-add-member">+ Invite</button>` })}
      <div class="card card--flush">
        <table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>${D.team.map(m=>`<tr>
          <td><div class="flex gap-8 center"><div class="avatar" style="width:28px; height:28px; font-size:10px">${(m.name||'?').slice(0,2).toUpperCase()}</div><strong>${m.name}</strong></div></td>
          <td class="mono t2">${m.email}</td>
          <td><span class="badge badge--${m.role==='Admin'?'crit':'low'}">${m.role}</span></td>
          <td class="t2">${m.last}</td>
          <td style="text-align:right"><button class="btn btn--sm btn--ghost btn-remove-member" data-email="${m.email}">Remove</button></td>
        </tr>`).join('')}</tbody></table>
      </div>
    `;
  }

  // ==================== REPORT (full detail + Thai/EN + compliance detail) ====================
  function report() {
    if (!D.findings.length) return empty('No scan data — run a scan first to generate a report');
    const avgScore = D.pillars.length ? Math.round(D.pillars.reduce((a,p)=>a+p.score,0)/D.pillars.length) : 0;
    const critCount = D.findings.filter(f=>f.severity==='CRITICAL').length;
    const highCount = D.findings.filter(f=>f.severity==='HIGH').length;
    const medCount = D.findings.filter(f=>f.severity==='MEDIUM').length;
    const lowCount = D.findings.filter(f=>f.severity==='LOW').length;
    const todayTH = new Date().toLocaleDateString('th-TH', {year:'numeric',month:'long',day:'numeric'});
    const todayEN = new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'});
    const costUsage = D.findings.find(f=>f.finding_type==='COST_USAGE');
    const totalSpend = costUsage ? costUsage.totalSpend : 0;
    const bySvc = {};
    D.findings.filter(f=>!f.finding_type||f.finding_type==='').forEach(f => { (bySvc[f.service||'Other'] ||= []).push(f); });
    const topRecs = D.findings.filter(f=>f.severity==='CRITICAL'||f.severity==='HIGH').slice(0,15);

    // Thai translations
    const T = {
      en: { confidential:'Confidential', title:'AWS Well-Architected Review Report', prepFor:'Prepared for', toc:'Table of Contents',
        s1:'Executive Summary', s1desc:'This report presents the results of an automated AWS Well-Architected Review conducted across {accts} AWS account(s) covering {svcs} services. The review evaluated resources against the five pillars of the AWS Well-Architected Framework.',
        scoreIs:'The overall score is', findingsFound:'findings were identified, including', critImmediate:'Immediate attention is required for Critical findings.', noCrit:'No Critical findings were detected.',
        s2:'Pillar-by-Pillar Analysis', topIssues:'Top issues:', noTopIssues:'No critical or high findings in this pillar.',
        s3:'Priority Recommendations', s3desc:'Address Critical items first, then High severity.',
        s4:'All Findings with Remediation', s5:'Compliance Frameworks — Detail', s5desc:'Category-level compliance status for each framework.',
        s6:'Cost Overview', footer:'Generated by AWS WA Review Platform',
        resource:'Resource', severity:'Severity', titleCol:'Title', recommendation:'Recommendation', category:'Category', ruleId:'Rule ID', status:'Status', description:'Description',
        date:'Date', region:'Region', services:'Services', findings:'Findings', score:'Score', critical:'Critical', high:'High', medium:'Medium', low:'Low',
        compliant:'Compliant', needAttn:'Need Attention', notAvail:'N/A', passed:'passed',
      },
      th: { confidential:'เอกสารลับ', title:'รายงานการตรวจสอบ AWS Well-Architected', prepFor:'จัดทำสำหรับ', toc:'สารบัญ',
        s1:'บทสรุปผู้บริหาร', s1desc:'รายงานฉบับนี้นำเสนอผลการตรวจสอบ AWS Well-Architected Review แบบอัตโนมัติ ครอบคลุม {accts} บัญชี AWS จำนวน {svcs} บริการ โดยประเมินทรัพยากรตามเสาหลัก 5 ด้านของ AWS Well-Architected Framework',
        scoreIs:'คะแนนรวม', findingsFound:'ข้อค้นพบ ประกอบด้วย', critImmediate:'ต้องดำเนินการแก้ไขข้อค้นพบระดับ Critical โดยเร่งด่วน', noCrit:'ไม่พบข้อค้นพบระดับ Critical',
        s2:'การวิเคราะห์รายเสาหลัก', topIssues:'ปัญหาสำคัญ:', noTopIssues:'ไม่พบข้อค้นพบระดับ Critical หรือ High ในเสาหลักนี้',
        s3:'คำแนะนำเร่งด่วน', s3desc:'แก้ไขรายการ Critical ก่อน ตามด้วย High',
        s4:'ข้อค้นพบทั้งหมดพร้อมวิธีแก้ไข', s5:'Compliance Frameworks — รายละเอียด', s5desc:'สถานะการปฏิบัติตามมาตรฐานระดับ Category สำหรับแต่ละ Framework',
        s6:'ภาพรวมค่าใช้จ่าย', footer:'สร้างโดย AWS WA Review Platform',
        resource:'ทรัพยากร', severity:'ระดับ', titleCol:'หัวข้อ', recommendation:'คำแนะนำ/วิธีแก้ไข', category:'หมวดหมู่', ruleId:'Rule ID', status:'สถานะ', description:'รายละเอียด',
        date:'วันที่', region:'ภูมิภาค', services:'บริการ', findings:'ข้อค้นพบ', score:'คะแนน', critical:'วิกฤต', high:'สูง', medium:'ปานกลาง', low:'ต่ำ',
        compliant:'ผ่าน', needAttn:'ต้องแก้ไข', notAvail:'ไม่มีข้อมูล', passed:'ผ่าน',
      }
    };

    return `
      ${ph({ eyebrow:'Reports · Executive', title:`Audit-ready, <em>in seconds.</em>`, sub:'Full report preview with compliance detail — review before generating PDF' })}

      <div class="card mb-24">
        <div class="flex between center wrap gap-16">
          <div class="flex gap-16 center wrap">
            <div>
              <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Language</label>
              <select id="rpt-lang" style="padding:6px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:13px;">
                <option value="en">English</option>
                <option value="th">ภาษาไทย</option>
              </select>
            </div>
            <div>
              <label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Frameworks</label>
              <div class="flex gap-8 wrap">${D.frameworks.map(f=>`<label class="chip"><input type="checkbox" name="rpt-fw" value="${f.id}" checked style="accent-color:var(--ac-500)"/> ${f.id.toUpperCase()}</label>`).join('')}</div>
            </div>
          </div>
          <button class="btn btn--accent" id="btn-gen-pdf2">Generate PDF</button>
        </div>
      </div>

      <div id="report-preview" style="background:var(--surface-2); border-radius:var(--r-xl); box-shadow:var(--shadow-2); overflow:hidden;">

        <!-- Cover -->
        <div style="padding:48px 40px; background:linear-gradient(135deg, var(--ac-100) 0%, var(--surface-2) 60%); border-bottom:1px solid var(--line);">
          <div style="font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--ac-600); margin-bottom:12px;" data-t="confidential">${T.en.confidential}</div>
          <h1 style="font-family:var(--font-display); font-size:38px; line-height:1.1; letter-spacing:-.02em; margin-bottom:8px;" data-t="title">${T.en.title}</h1>
          <p class="t2" style="font-size:16px; margin-bottom:24px;"><span data-t="prepFor">${T.en.prepFor}</span> Com7 Business · ${D.accounts.length} AWS Account(s)</p>
          <div class="flex gap-24" style="font-size:13px; color:var(--text-2);">
            <div><span data-t="date">${T.en.date}</span>: <strong class="rpt-date-en">${todayEN}</strong><strong class="rpt-date-th" style="display:none">${todayTH}</strong></div>
            <div><span data-t="region">${T.en.region}</span>: <strong>ap-southeast-1</strong></div>
            <div><span data-t="services">${T.en.services}</span>: <strong>${D.services.length}</strong></div>
            <div><span data-t="findings">${T.en.findings}</span>: <strong>${D.findings.length}</strong></div>
          </div>
        </div>

        <!-- TOC -->
        <div style="padding:32px 40px; border-bottom:1px solid var(--line);">
          <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:16px;" data-t="toc">${T.en.toc}</h2>
          <div style="display:flex; flex-direction:column; gap:6px; font-size:14px;">
            <div class="flex between" style="padding:6px 0; border-bottom:1px dotted var(--line-2);"><span>1. <span data-t="s1">${T.en.s1}</span></span><span class="t3">${avgScore}/100</span></div>
            <div class="flex between" style="padding:6px 0; border-bottom:1px dotted var(--line-2);"><span>2. <span data-t="s2">${T.en.s2}</span></span><span class="t3">5 Pillars</span></div>
            <div class="flex between" style="padding:6px 0; border-bottom:1px dotted var(--line-2);"><span>3. <span data-t="s3">${T.en.s3}</span></span><span class="t3">${topRecs.length} items</span></div>
            <div class="flex between" style="padding:6px 0; border-bottom:1px dotted var(--line-2);"><span>4. <span data-t="s4">${T.en.s4}</span></span><span class="t3">${D.findings.length} findings</span></div>
            <div class="flex between" style="padding:6px 0; border-bottom:1px dotted var(--line-2);"><span>5. <span data-t="s5">${T.en.s5}</span></span><span class="t3">${D.frameworks.length} frameworks</span></div>
            ${totalSpend > 0 ? '<div class="flex between" style="padding:6px 0; border-bottom:1px dotted var(--line-2);"><span>6. <span data-t="s6">' + T.en.s6 + '</span></span><span class="t3">$' + money(totalSpend) + '/mo</span></div>' : ''}
          </div>
        </div>

        <!-- 1. Executive Summary -->
        <div style="padding:32px 40px; border-bottom:1px solid var(--line);">
          <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-500); margin-bottom:8px;">Section 1</div>
          <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:16px;" data-t="s1">${T.en.s1}</h2>
          <p class="t2 rpt-s1-desc" style="margin-bottom:20px; line-height:1.7; font-size:14px;">${T.en.s1desc.replace('{accts}',D.accounts.length).replace('{svcs}',D.services.length)}</p>
          <p class="t2" style="margin-bottom:20px; line-height:1.7; font-size:14px;"><span data-t="scoreIs">${T.en.scoreIs}</span> <strong>${avgScore}/100</strong>. ${D.findings.length} <span data-t="findingsFound">${T.en.findingsFound}</span> <strong style="color:var(--s-crit)">${critCount} Critical</strong>, <strong style="color:var(--s-high)">${highCount} High</strong>, <strong style="color:var(--s-med)">${medCount} Medium</strong>, <strong style="color:var(--s-low)">${lowCount} Low</strong>. ${critCount > 0 ? '<span data-t="critImmediate">' + T.en.critImmediate + '</span>' : '<span data-t="noCrit">' + T.en.noCrit + '</span>'}</p>
          <div class="grid grid-4" style="gap:12px;">
            <div style="padding:16px; background:var(--surface); border-radius:var(--r-sm); text-align:center;"><div class="t3" style="font-size:11px;" data-t="score">${T.en.score}</div><div style="font-family:var(--font-display); font-size:36px;">${avgScore}</div></div>
            <div style="padding:16px; background:var(--surface); border-radius:var(--r-sm); text-align:center;"><div class="t3" style="font-size:11px;" data-t="critical">${T.en.critical}</div><div style="font-family:var(--font-display); font-size:36px; color:var(--s-crit);">${critCount}</div></div>
            <div style="padding:16px; background:var(--surface); border-radius:var(--r-sm); text-align:center;"><div class="t3" style="font-size:11px;" data-t="high">${T.en.high}</div><div style="font-family:var(--font-display); font-size:36px; color:var(--s-high);">${highCount}</div></div>
            <div style="padding:16px; background:var(--surface); border-radius:var(--r-sm); text-align:center;"><div class="t3" style="font-size:11px;" data-t="findings">${T.en.findings}</div><div style="font-family:var(--font-display); font-size:36px;">${D.findings.length}</div></div>
          </div>
        </div>

        <!-- 2. Pillar Analysis -->
        <div style="padding:32px 40px; border-bottom:1px solid var(--line);">
          <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-500); margin-bottom:8px;">Section 2</div>
          <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:20px;" data-t="s2">${T.en.s2}</h2>
          ${D.pillars.map(p => {
            const topF = D.findings.filter(f=>f.pillar===p.name&&(f.severity==='CRITICAL'||f.severity==='HIGH')).slice(0,3);
            return `<div style="margin-bottom:24px; padding:20px; background:var(--surface); border-radius:var(--r-md);">
              <div class="flex between center mb-8"><h3 style="font-size:16px;">${p.name}</h3><span style="font-family:var(--font-display); font-size:28px; color:${p.score>=75?'var(--s-low)':p.score>=60?'var(--s-med)':'var(--s-crit)'};">${p.score}</span></div>
              <div class="pillar__bar mb-8"><span style="width:${p.score}%;background:${p.score>=75?'var(--s-low)':p.score>=60?'var(--s-med)':'var(--s-crit)'}"></span></div>
              <div class="flex gap-16 mb-12" style="font-size:12px;"><span><span class="sq sq--crit"></span> C: <b>${p.crit}</b></span><span><span class="sq sq--high"></span> H: <b>${p.high}</b></span><span><span class="sq sq--med"></span> M: <b>${p.med}</b></span><span><span class="sq sq--low"></span> L: <b>${p.low}</b></span></div>
              ${topF.length ? topF.map(f=>'<div style="padding:8px 12px; margin-bottom:4px; background:var(--surface-2); border-radius:var(--r-xs); font-size:13px;">'+sevBadge(f.severity)+' '+f.title+'<div class="t2 mt-8" style="font-size:12px;">'+( f.recommendation||f.description||'')+'</div></div>').join('') : ''}
            </div>`;
          }).join('')}
        </div>

        <!-- 3. Priority Recommendations -->
        <div style="padding:32px 40px; border-bottom:1px solid var(--line);">
          <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-500); margin-bottom:8px;">Section 3</div>
          <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:16px;" data-t="s3">${T.en.s3}</h2>
          <p class="t2 mb-16" style="font-size:14px;" data-t="s3desc">${T.en.s3desc}</p>
          ${topRecs.map((f,i) => `<div style="padding:16px; margin-bottom:8px; background:var(--surface); border-radius:var(--r-sm); border-left:3px solid ${f.severity==='CRITICAL'?'var(--s-crit)':'var(--s-high)'};">
            <div class="flex gap-8 center mb-4"><span class="t3" style="min-width:20px;">${i+1}.</span>${sevBadge(f.severity)}<strong style="font-size:14px;">${f.title}</strong><span class="chip mono" style="font-size:11px; margin-left:auto;">${f.service}</span></div>
            <div style="margin-left:28px;"><div class="mono t3" style="font-size:11px; margin-bottom:6px;">${f.resource}</div><div style="font-size:13px; color:var(--text-2); line-height:1.6;">${f.recommendation || f.description || '—'}</div></div>
          </div>`).join('')}
        </div>

        <!-- 4. All Findings with Remediation -->
        <div style="padding:32px 40px; border-bottom:1px solid var(--line);">
          <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-500); margin-bottom:8px;">Section 4</div>
          <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:20px;" data-t="s4">${T.en.s4}</h2>
          ${Object.entries(bySvc).sort((a,b)=>b[1].length-a[1].length).map(([svc, items]) => `
            <div style="margin-bottom:24px;">
              <div class="flex between center mb-8"><h3 style="font-size:15px;">${svc}</h3><span class="badge badge--outline">${items.length}</span></div>
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead><tr style="background:var(--surface);"><th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="resource">${T.en.resource}</th><th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="severity">${T.en.severity}</th><th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="titleCol">${T.en.titleCol}</th><th style="padding:8px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="recommendation">${T.en.recommendation}</th></tr></thead>
                <tbody>${items.map(f => `<tr><td style="padding:8px 10px; border-bottom:1px solid var(--line); font-family:var(--font-mono); font-size:11px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.resource}</td><td style="padding:8px 10px; border-bottom:1px solid var(--line);">${sevBadge(f.severity)}</td><td style="padding:8px 10px; border-bottom:1px solid var(--line);">${f.title}</td><td style="padding:8px 10px; border-bottom:1px solid var(--line); color:var(--text-2); font-size:11.5px; line-height:1.5;">${f.recommendation || f.description || '—'}</td></tr>`).join('')}</tbody>
              </table>
            </div>
          `).join('')}
        </div>

        <!-- 5. Compliance Frameworks Detail -->
        <div style="padding:32px 40px; border-bottom:1px solid var(--line);">
          <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-500); margin-bottom:8px;">Section 5</div>
          <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:8px;" data-t="s5">${T.en.s5}</h2>
          <p class="t2 mb-24" style="font-size:13px;" data-t="s5desc">${T.en.s5desc}</p>
          ${D.frameworks.map(f => {
            const pct = f.controls>0 ? Math.round(f.passed/f.controls*100) : 0;
            const details = f.details || [];
            const cats = {};
            details.forEach(d => { (cats[d.category] ||= []).push(d); });
            const needAttn = details.filter(d=>d.status==='Need Attention').length;
            const compliant = details.filter(d=>d.status==='Compliant').length;
            const na = details.filter(d=>d.status==='N/A').length;
            return `<div class="rpt-fw-block" data-fw="${f.id}" style="margin-bottom:32px; padding:20px; background:var(--surface); border-radius:var(--r-md);">
              <div class="flex between center mb-12">
                <div><div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase;">${f.id.toUpperCase()}</div><h3 style="font-size:16px;">${f.name}</h3>${f.desc ? '<div class="t2" style="font-size:12px; margin-top:4px;">' + f.desc + '</div>' : ''}</div>
                <div style="text-align:right;"><div style="font-family:var(--font-display); font-size:32px; color:${pct>=75?'var(--s-low)':pct>=50?'var(--s-med)':'var(--s-crit)'};">${pct}%</div><div class="t3" style="font-size:11px;">${f.passed}/${f.controls} <span data-t="passed">${T.en.passed}</span></div></div>
              </div>
              <div class="flex gap-12 mb-12" style="font-size:12px;"><span style="color:var(--s-low)"><span data-t="compliant">${T.en.compliant}</span>: ${compliant}</span><span style="color:var(--s-crit)"><span data-t="needAttn">${T.en.needAttn}</span>: ${needAttn}</span><span class="t3"><span data-t="notAvail">${T.en.notAvail}</span>: ${na}</span></div>
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead><tr style="background:var(--surface-2);"><th style="padding:6px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="category">${T.en.category}</th><th style="padding:6px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="ruleId">${T.en.ruleId}</th><th style="padding:6px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="status">${T.en.status}</th><th style="padding:6px 10px; text-align:left; border-bottom:1px solid var(--line);" data-t="description">${T.en.description}</th></tr></thead>
                <tbody>${Object.entries(cats).map(([cat, items]) => items.map((d,i) => '<tr>' + (i===0?'<td rowspan="'+items.length+'" style="padding:6px 10px; vertical-align:top; font-weight:500; background:var(--surface-2); border-bottom:1px solid var(--line); border-right:1px solid var(--line);">'+cat+'</td>':'') + '<td class="mono" style="padding:6px 10px; border-bottom:1px solid var(--line); font-size:11px;">'+d.id+'</td><td style="padding:6px 10px; border-bottom:1px solid var(--line);"><span class="badge badge--'+(d.status==='Compliant'?'low':d.status==='Need Attention'?'crit':'info')+'">'+d.status+'</span></td><td style="padding:6px 10px; border-bottom:1px solid var(--line);">'+d.title+(d.recommendation?'<div style="color:var(--text-2); font-size:11px; margin-top:4px;">'+d.recommendation+'</div>':'')+'</td></tr>').join('')).join('')}</tbody>
              </table>
            </div>`;
          }).join('')}
        </div>

        ${totalSpend > 0 ? `
        <!-- 6. Cost -->
        <div style="padding:32px 40px; border-bottom:1px solid var(--line);">
          <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-500); margin-bottom:8px;">Section 6</div>
          <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:16px;" data-t="s6">${T.en.s6}</h2>
          <p class="t2 mb-16" style="font-size:14px;">Monthly spend: <strong>$${money(totalSpend)}</strong></p>
          ${costUsage && costUsage.serviceBreakdown ? '<table style="width:100%; border-collapse:collapse; font-size:13px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Service</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Cost</th></tr></thead><tbody>' + costUsage.serviceBreakdown.slice(0,10).map(s=>'<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);">'+s.service+'</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line); font-family:var(--font-mono);">$'+money(s.amount)+'</td></tr>').join('') + '</tbody></table>' : ''}
        </div>` : ''}

        <div style="padding:24px 40px; text-align:center; color:var(--text-3); font-size:12px;" data-t="footer">${T.en.footer} · Powered by Com7 Business · <span class="rpt-date-en">${todayEN}</span><span class="rpt-date-th" style="display:none">${todayTH}</span></div>
      </div>
    `;
  }
  // ==================== CLOUDFINOPS (real cost data) ====================
  // ==================== CLOUDFINOPS (full detail + RI/SP guidance) ====================
  function cost() {
    if (!D.costOpps.length && !D.findings.some(f=>f.finding_type==='COST_USAGE')) return empty('No cost data — run a scan first');

    const costUsage = D.findings.find(f=>f.finding_type==='COST_USAGE');
    const totalSpend = costUsage ? costUsage.totalSpend : 0;
    const svcBreakdown = costUsage ? costUsage.serviceBreakdown : [];
    const riFindings = D.findings.filter(f=>f.finding_type==='RI_RECOMMENDATION');
    const spFindings = D.findings.filter(f=>f.finding_type==='SP_RECOMMENDATION');
    const riSavings = riFindings.reduce((s,f)=>s+f.monthlySavings,0);
    const spSavings = spFindings.reduce((s,f)=>s+f.monthlySavings,0);
    const totalSavings = riSavings + spSavings;
    const costOpts = D.findings.filter(f=>f.finding_type==='COST_OPTIMIZATION');
    const allOpps = [...riFindings, ...spFindings, ...costOpts];
    const maxSaving = Math.max(1, ...allOpps.map(f=>f.monthlySavings||f.actualSpend||1));

    return `
      ${ph({ eyebrow:'Reports · CloudFinOps', title:`Save <em>${money(totalSavings)}</em> / month.`, sub:'Cost optimization with actionable RI and Savings Plan recommendations' })}

      ${totalSpend > 0 ? `
      <div class="grid grid-3 mb-24">
        <div class="kpi"><div class="kpi__label">Actual Monthly Spend</div><div class="kpi__val">${money(totalSpend)}</div></div>
        <div class="kpi"><div class="kpi__label">Potential Savings</div><div class="kpi__val" style="color:var(--s-low)">${money(totalSavings)}</div><span class="kpi__delta kpi__delta--good">RI + Savings Plans</span></div>
        <div class="kpi"><div class="kpi__label">After Optimization</div><div class="kpi__val">${money(totalSpend - totalSavings)}</div></div>
      </div>` : ''}

      <!-- RI Recommendations Detail -->
      <div class="card mb-24">
        <div class="flex between center mb-16">
          <div><h3>Reserved Instance Recommendations</h3><p class="t2" style="font-size:13px;">Based on your last 30 days of usage, AWS recommends purchasing these RIs.</p></div>
          <span class="badge badge--outline">${riFindings.length} recommendations</span>
        </div>
        ${riFindings.length ? riFindings.map(f => `
          <div style="padding:16px; margin-bottom:8px; background:var(--surface); border-radius:var(--r-sm); border-left:3px solid var(--s-low);">
            <div class="flex between center mb-8">
              <div class="flex gap-8 center"><strong style="font-size:15px;">${f.title}</strong></div>
              <span style="font-family:var(--font-display); font-size:22px; color:var(--s-low);">$${(f.monthlySavings||0).toFixed(0)}<span style="font-size:12px; color:var(--text-3)">/mo</span></span>
            </div>
            <p class="t2" style="font-size:13px; margin-bottom:12px;">${f.description || f.recommendation || ''}</p>
            <div class="flex gap-16 wrap mb-12" style="font-size:12px;">
              ${f.instanceType ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Instance Type:</span> <strong class="mono">' + f.instanceType + '</strong></div>' : ''}
              ${f.instanceCount ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Quantity:</span> <strong>' + f.instanceCount + '</strong></div>' : ''}
              ${f.upfrontCost ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Upfront:</span> <strong class="mono">$' + f.upfrontCost.toFixed(0) + '</strong></div>' : ''}
              ${f.recurringMonthlyCost ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Monthly:</span> <strong class="mono">$' + f.recurringMonthlyCost.toFixed(0) + '</strong></div>' : ''}
              ${f.savingsPercentage ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Discount:</span> <strong>' + f.savingsPercentage.toFixed(0) + '%</strong></div>' : ''}
              <div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Term:</span> <strong>${f.term || '1 Year'}</strong></div>
              <div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Payment:</span> <strong>${f.paymentOption || 'Partial Upfront'}</strong></div>
            </div>
            <details style="font-size:13px; color:var(--text-2);">
              <summary style="cursor:pointer; font-weight:500; color:var(--ac-500); margin-bottom:8px;">How to purchase this RI</summary>
              <ol style="padding-left:20px; line-height:1.8;">
                <li>Go to <strong>AWS Console</strong> → <strong>${f.service || 'EC2'}</strong> → <strong>Reserved Instances</strong></li>
                <li>Click <strong>"Purchase Reserved Instances"</strong></li>
                <li>Select: Instance Type = <strong class="mono">${f.instanceType || 'as recommended'}</strong>, Term = <strong>${f.term || '1 Year'}</strong>, Payment = <strong>${f.paymentOption || 'Partial Upfront'}</strong></li>
                <li>Quantity: <strong>${f.instanceCount || 1}</strong></li>
                <li>Review the pricing: Upfront ~<strong>$${(f.upfrontCost||0).toFixed(0)}</strong>, Monthly ~<strong>$${(f.recurringMonthlyCost||0).toFixed(0)}</strong></li>
                <li>Click <strong>"Purchase"</strong> to confirm</li>
              </ol>
              <div class="t3 mt-8">Estimated annual savings: <strong style="color:var(--s-low)">$${((f.monthlySavings||0)*12).toFixed(0)}</strong></div>
            </details>
          </div>
        `).join('') : '<div style="padding:20px; background:var(--surface); border-radius:var(--r-sm); text-align:center;"><p class="t2">No RI recommendations — your usage pattern may not benefit from Reserved Instances, or the account has low compute usage.</p><p class="t3 mt-8">Tip: RIs work best for steady-state workloads running 24/7 (e.g., production databases, always-on EC2 instances).</p></div>'}
      </div>

      <!-- SP Recommendations Detail -->
      <div class="card mb-24">
        <div class="flex between center mb-16">
          <div><h3>Savings Plan Recommendations</h3><p class="t2" style="font-size:13px;">Flexible commitment-based discounts that apply across EC2, Fargate, and Lambda.</p></div>
          <span class="badge badge--outline">${spFindings.length} recommendations</span>
        </div>
        ${spFindings.length ? spFindings.map(f => `
          <div style="padding:16px; margin-bottom:8px; background:var(--surface); border-radius:var(--r-sm); border-left:3px solid var(--ac-500);">
            <div class="flex between center mb-8">
              <strong style="font-size:15px;">${f.title}</strong>
              <span style="font-family:var(--font-display); font-size:22px; color:var(--s-low);">$${(f.monthlySavings||0).toFixed(0)}<span style="font-size:12px; color:var(--text-3)">/mo</span></span>
            </div>
            <p class="t2" style="font-size:13px; margin-bottom:12px;">${f.description || f.recommendation || ''}</p>
            <div class="flex gap-16 wrap mb-12" style="font-size:12px;">
              ${f.hourlyCommitment ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Commit:</span> <strong class="mono">$' + f.hourlyCommitment.toFixed(3) + '/hr</strong></div>' : ''}
              ${f.hourlyCommitment ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Monthly commit:</span> <strong class="mono">$' + (f.hourlyCommitment*730).toFixed(0) + '/mo</strong></div>' : ''}
              ${f.currentOnDemandSpend ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Current OD:</span> <strong class="mono">$' + f.currentOnDemandSpend.toFixed(0) + '/mo</strong></div>' : ''}
              ${f.savingsPercentage ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Discount:</span> <strong>' + f.savingsPercentage.toFixed(0) + '%</strong></div>' : ''}
              ${f.upfrontCost ? '<div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Upfront:</span> <strong class="mono">$' + f.upfrontCost.toFixed(0) + '</strong></div>' : ''}
              <div style="padding:6px 12px; background:var(--surface-2); border-radius:var(--r-xs);"><span class="t3">Term:</span> <strong>${f.term || '1 Year'}</strong></div>
            </div>
            <details style="font-size:13px; color:var(--text-2);">
              <summary style="cursor:pointer; font-weight:500; color:var(--ac-500); margin-bottom:8px;">How to purchase this Savings Plan</summary>
              <ol style="padding-left:20px; line-height:1.8;">
                <li>Go to <strong>AWS Console</strong> → <strong>Cost Management</strong> → <strong>Savings Plans</strong></li>
                <li>Click <strong>"Purchase Savings Plans"</strong></li>
                <li>Select: Type = <strong>Compute Savings Plan</strong>, Term = <strong>${f.term || '1 Year'}</strong>, Payment = <strong>${f.paymentOption || 'Partial Upfront'}</strong></li>
                <li>Hourly commitment: <strong class="mono">$${(f.hourlyCommitment||0).toFixed(3)}/hr</strong></li>
                <li>Review: This covers EC2, Fargate, and Lambda usage automatically</li>
                <li>Click <strong>"Submit"</strong> to purchase</li>
              </ol>
              <div class="t3 mt-8">Estimated annual savings: <strong style="color:var(--s-low)">$${((f.monthlySavings||0)*12).toFixed(0)}</strong></div>
              <div class="t3 mt-8" style="font-size:12px;">Savings Plans are more flexible than RIs — they apply across instance families, sizes, OS, and regions (Compute SP).</div>
            </details>
          </div>
        `).join('') : '<div style="padding:20px; background:var(--surface); border-radius:var(--r-sm); text-align:center;"><p class="t2">No Savings Plan recommendations — your compute spend may be too low for SP benefits.</p><p class="t3 mt-8">Tip: Savings Plans are ideal when you have consistent compute usage but want flexibility to change instance types.</p></div>'}
      </div>

      <!-- Compute Optimizer — Rightsizing -->
      ${(() => {
        const rsFindings = D.findings.filter(f=>f.finding_type==='RIGHTSIZING');
        const rsSavings = rsFindings.reduce((s,f)=>s+(f.monthlySavings||0),0);
        const idle = rsFindings.filter(f=>f.isIdle);
        const ec2Rs = rsFindings.filter(f=>f.service==='EC2'&&!f.isIdle);
        const lambdaRs = rsFindings.filter(f=>f.service==='Lambda');
        const ebsRs = rsFindings.filter(f=>f.service==='EBS');
        const rdsRs = rsFindings.filter(f=>f.service==='RDS');
        const asgRs = rsFindings.filter(f=>f.service==='Auto Scaling');
        const ecsRs = rsFindings.filter(f=>f.service==='ECS');
        const licRs = rsFindings.filter(f=>f.service==='License');

        const noData = !rsFindings.length;

        return `
      <div class="card mb-24">
        <div class="flex between center mb-16">
          <div><h3>Compute Optimizer — Rightsizing</h3><p class="t2" style="font-size:13px;">EC2, Lambda, EBS rightsizing recommendations from AWS Compute Optimizer.</p></div>
          <div style="text-align:right;"><div style="font-family:var(--font-display); font-size:28px; color:var(--s-low);">$${money(rsSavings)}<span style="font-size:12px; color:var(--text-3)">/mo</span></div><span class="t3">${rsFindings.length} recommendations</span></div>
        </div>

        ${noData ? '<div style="padding:24px; background:var(--surface); border-radius:var(--r-sm); text-align:center;"><p class="t2" style="margin-bottom:8px;">No rightsizing data yet.</p><p class="t3" style="font-size:12px;">Run a new scan after deploying the latest backend to get Compute Optimizer recommendations. Make sure Compute Optimizer is opted-in for the target account (AWS Console → Compute Optimizer → Opt in).</p></div>' : ''}

        ${idle.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--s-crit);">Idle Resources (' + idle.length + ')</div>' + idle.map(f => '<div style="padding:14px 16px; margin-bottom:6px; background:var(--surface); border-radius:var(--r-sm); border-left:3px solid var(--s-crit);"><div class="flex between center"><div><strong>' + (f.resource || f.currentType) + '</strong> <span class="mono t3" style="font-size:11px;">' + f.currentType + '</span></div><strong style="color:var(--s-crit);">$' + (f.monthlySavings||0).toFixed(0) + '/mo wasted</strong></div><div class="t2 mt-8" style="font-size:12px;">' + (f.recommendation||'') + '</div></div>').join('') + '</div>' : ''}

        ${ec2Rs.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase;">EC2 Rightsizing (' + ec2Rs.length + ')</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Instance</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Current</th><th style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--line);"></th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Recommended</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Savings</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Effort</th></tr></thead><tbody>' + ec2Rs.map(f => '<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong>' + (f.resource||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono">' + (f.currentType||'') + '</td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:center; color:var(--ac-500);">→</td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono"><strong style="color:var(--s-low);">' + (f.recommendedType||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:right;"><strong>$' + (f.monthlySavings||0).toFixed(0) + '</strong><span class="t3">/mo</span></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><span class="badge badge--' + (f.migrationEffort==='Low'?'low':f.migrationEffort==='Very Low'?'low':'med') + '">' + (f.migrationEffort||'Medium') + '</span></td></tr>').join('') + '</tbody></table></div>' : ''}

        ${lambdaRs.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase;">Lambda Memory Tuning (' + lambdaRs.length + ')</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Function</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Current</th><th style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--line);"></th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Recommended</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Savings</th></tr></thead><tbody>' + lambdaRs.map(f => '<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong>' + (f.resource||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono">' + (f.currentType||'') + '</td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:center; color:var(--ac-500);">→</td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono"><strong style="color:var(--s-low);">' + (f.recommendedType||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:right;"><strong>$' + (f.monthlySavings||0).toFixed(0) + '</strong><span class="t3">/mo</span></td></tr>').join('') + '</tbody></table></div>' : ''}

        ${ebsRs.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase;">EBS Volume Optimization (' + ebsRs.length + ')</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Volume</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Current</th><th style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--line);"></th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Recommended</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Savings</th></tr></thead><tbody>' + ebsRs.map(f => '<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong class="mono">' + (f.resource||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono">' + (f.currentType||'') + '</td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:center; color:var(--ac-500);">→</td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono"><strong style="color:var(--s-low);">' + (f.recommendedType||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:right;"><strong>$' + (f.monthlySavings||0).toFixed(0) + '</strong><span class="t3">/mo</span></td></tr>').join('') + '</tbody></table></div>' : ''}

        ${rdsRs.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase;">RDS Database Rightsizing (' + rdsRs.length + ')</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Database</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Current</th><th style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--line);"></th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Recommended</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Savings</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Effort</th></tr></thead><tbody>' + rdsRs.map(f => '<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong>' + (f.resource||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono">' + (f.currentType||'') + '</td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:center; color:var(--ac-500);">→</td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono"><strong style="color:var(--s-low);">' + (f.recommendedType||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:right;"><strong>$' + (f.monthlySavings||0).toFixed(0) + '</strong><span class="t3">/mo</span></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><span class="badge badge--' + (f.migrationEffort==='Low'?'low':'med') + '">' + (f.migrationEffort||'Medium') + '</span></td></tr>').join('') + '</tbody></table></div>' : ''}

        ${asgRs.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase;">Auto Scaling Group Rightsizing (' + asgRs.length + ')</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">ASG Name</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Current</th><th style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--line);"></th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Recommended</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Savings</th></tr></thead><tbody>' + asgRs.map(f => '<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong>' + (f.resource||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono">' + (f.currentType||'') + '</td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:center; color:var(--ac-500);">→</td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono"><strong style="color:var(--s-low);">' + (f.recommendedType||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:right;"><strong>$' + (f.monthlySavings||0).toFixed(0) + '</strong><span class="t3">/mo</span></td></tr>').join('') + '</tbody></table></div>' : ''}

        ${ecsRs.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase;">ECS Service Rightsizing (' + ecsRs.length + ')</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Service</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Current</th><th style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--line);"></th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Recommended</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Savings</th></tr></thead><tbody>' + ecsRs.map(f => '<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong>' + (f.resource||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono">' + (f.currentType||'') + '</td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:center; color:var(--ac-500);">→</td><td style="padding:8px 12px; border-bottom:1px solid var(--line);" class="mono"><strong style="color:var(--s-low);">' + (f.recommendedType||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:right;"><strong>$' + (f.monthlySavings||0).toFixed(0) + '</strong><span class="t3">/mo</span></td></tr>').join('') + '</tbody></table></div>' : ''}

        ${licRs.length ? '<div class="mb-16"><div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase;">License Optimization (' + licRs.length + ')</div><table style="width:100%; border-collapse:collapse; font-size:12.5px;"><thead><tr style="background:var(--surface);"><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Resource</th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Current License</th><th style="padding:8px 12px; text-align:center; border-bottom:1px solid var(--line);"></th><th style="padding:8px 12px; text-align:left; border-bottom:1px solid var(--line);">Recommended</th><th style="padding:8px 12px; text-align:right; border-bottom:1px solid var(--line);">Savings</th></tr></thead><tbody>' + licRs.map(f => '<tr><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong>' + (f.resource||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line);">' + (f.currentType||'') + '</td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:center; color:var(--ac-500);">→</td><td style="padding:8px 12px; border-bottom:1px solid var(--line);"><strong style="color:var(--s-low);">' + (f.recommendedType||'') + '</strong></td><td style="padding:8px 12px; border-bottom:1px solid var(--line); text-align:right;"><strong>$' + (f.monthlySavings||0).toFixed(0) + '</strong><span class="t3">/mo</span></td></tr>').join('') + '</tbody></table></div>' : ''}

        <details style="font-size:13px; color:var(--text-2); margin-top:12px;">
          <summary style="cursor:pointer; font-weight:500; color:var(--ac-500); margin-bottom:8px;">How to apply rightsizing recommendations</summary>
          <div style="line-height:1.8;">
            <p style="margin-bottom:12px;"><strong>EC2 Instances:</strong></p>
            <ol style="padding-left:20px; margin-bottom:16px;">
              <li>Stop the instance (or schedule during maintenance window)</li>
              <li>Actions → Instance Settings → Change Instance Type</li>
              <li>Select the recommended type and start the instance</li>
              <li>Monitor performance for 24-48 hours to confirm</li>
            </ol>
            <p style="margin-bottom:12px;"><strong>Lambda Functions:</strong></p>
            <ol style="padding-left:20px; margin-bottom:16px;">
              <li>Go to Lambda → Function → Configuration → General</li>
              <li>Edit Memory to the recommended value</li>
              <li>Use <a href="https://github.com/alexcasalboni/aws-lambda-power-tuning" style="color:var(--ac-500);">Lambda Power Tuning</a> for precise optimization</li>
            </ol>
            <p style="margin-bottom:12px;"><strong>EBS Volumes:</strong></p>
            <ol style="padding-left:20px;">
              <li>Go to EC2 → Volumes → Select volume → Modify</li>
              <li>Change type (e.g., gp2 → gp3) and/or size — no downtime for most changes</li>
              <li>gp3 is typically 20% cheaper than gp2 with better baseline performance</li>
            </ol>
            <p style="margin-top:16px; margin-bottom:12px;"><strong>RDS Databases:</strong></p>
            <ol style="padding-left:20px;">
              <li>Go to RDS Console → Select database → Modify</li>
              <li>Change DB instance class to the recommended type</li>
              <li>Choose "Apply during next maintenance window" for production</li>
              <li>For Aurora, modify the reader/writer instances separately</li>
            </ol>
            <p style="margin-top:16px; margin-bottom:12px;"><strong>Auto Scaling Groups:</strong></p>
            <ol style="padding-left:20px;">
              <li>EC2 → Launch Templates → Create new version with recommended instance type</li>
              <li>ASG → Edit → Update to new launch template version</li>
              <li>Start Instance Refresh to gradually roll out changes</li>
            </ol>
            <p style="margin-top:16px; margin-bottom:12px;"><strong>ECS Services (Fargate):</strong></p>
            <ol style="padding-left:20px;">
              <li>ECS → Task Definitions → Create new revision with recommended CPU/Memory</li>
              <li>Update Service to use the new task definition revision</li>
              <li>ECS will perform a rolling deployment automatically</li>
            </ol>
            <p style="margin-top:16px; margin-bottom:12px;"><strong>License Optimization (Windows/SQL Server):</strong></p>
            <ol style="padding-left:20px;">
              <li>Review if workload can run on Linux — migrate to save Windows license cost</li>
              <li>For SQL Server: downgrade from Enterprise to Standard/Web if features allow</li>
              <li>Consider BYOL (Bring Your Own License) with dedicated hosts for existing licenses</li>
              <li>Use AWS License Manager to track usage and enforce license rules</li>
              <li>Go to AWS Console → License Manager → Dashboard for current license inventory</li>
            </ol>
          </div>
        </details>
      </div>`;
      })()}

      <!-- Per-Service Optimization Tips -->
      ${costOpts.length ? `
      <div class="card mb-24">
        <h3 class="mb-16">Per-Service Optimization</h3>
        <p class="t2 mb-16" style="font-size:13px;">Actionable tips based on your actual spend per service.</p>
        ${costOpts.sort((a,b)=>(b.actualSpend||0)-(a.actualSpend||0)).map(f => `
          <div style="padding:14px 16px; margin-bottom:6px; background:var(--surface); border-radius:var(--r-sm); display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
            <div style="flex:1;">
              <div class="flex gap-8 center mb-4"><strong>${f.service}</strong>${sevBadge(f.severity)}<span class="mono t3" style="font-size:11px;">$${(f.actualSpend||0).toFixed(0)}/mo (${(f.spendPercentage||0).toFixed(0)}%)</span></div>
              <div style="font-size:13px; color:var(--text-2); line-height:1.6;">${f.recommendation || f.description || '—'}</div>
            </div>
            <div style="min-width:80px; text-align:right;"><strong style="font-family:var(--font-display); font-size:20px;">$${money(f.actualSpend||0)}</strong><div class="t3" style="font-size:11px;">/month</div></div>
          </div>
        `).join('')}
      </div>` : ''}

      ${svcBreakdown.length ? `
      <div class="card card--flush mb-24">
        <div class="card__head" style="padding:20px 24px 0"><h3>Spend by Service</h3></div>
        <table class="tbl"><thead><tr><th>Service</th><th style="text-align:right">Monthly Cost</th><th style="text-align:right">% of Total</th></tr></thead>
        <tbody>${svcBreakdown.slice(0,12).map(s=>{
          const pct = totalSpend>0 ? ((s.amount/totalSpend)*100).toFixed(1) : '0';
          return `<tr><td><strong>${s.service.replace(/^Amazon\s+/,'').replace(/^AWS\s+/,'')}</strong></td><td style="text-align:right" class="mono">${money(s.amount)}</td><td style="text-align:right">${pct}%</td></tr>`;
        }).join('')}</tbody></table>
      </div>` : ''}

      <!-- RI/SP Calculator -->
      <div class="card mb-24">
        <h3 class="mb-8">Custom Calculator</h3>
        <p class="t2 mb-16" style="font-size:13px;">Estimate savings for different RI/SP configurations beyond AWS recommendations.</p>
        <div class="grid grid-2" style="gap:16px; grid-template-columns:1fr 1fr;">
          <div style="background:var(--surface); border-radius:var(--r-sm); padding:16px;">
            <div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase">RI Calculator</div>
            <div class="flex gap-8 mb-8">
              <select id="ri-svc" style="flex:1; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px;"><option value="ec2">EC2</option><option value="rds">RDS</option><option value="elasticache">ElastiCache</option><option value="opensearch">OpenSearch</option><option value="redshift">Redshift</option></select>
              <select id="ri-term" style="flex:1; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px;"><option value="1">1 Year</option><option value="3">3 Years</option></select>
              <select id="ri-payment" style="flex:1; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px;"><option value="none">No Upfront</option><option value="partial" selected>Partial Upfront</option><option value="all">All Upfront</option></select>
            </div>
            <div class="flex gap-8 mb-8">
              <div style="flex:1"><label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">On-Demand $/hr</label><input type="number" id="ri-od" value="0.10" step="0.01" min="0" style="width:100%; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px; font-family:var(--font-mono);"></div>
              <div style="flex:1"><label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Count</label><input type="number" id="ri-count" value="1" min="1" style="width:100%; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px; font-family:var(--font-mono);"></div>
            </div>
            <button class="btn btn--accent btn--sm" id="ri-calc" style="width:100%;">Calculate</button>
            <div id="ri-result" class="mt-8"></div>
          </div>
          <div style="background:var(--surface); border-radius:var(--r-sm); padding:16px;">
            <div class="t3 mb-8" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase">SP Calculator</div>
            <div class="flex gap-8 mb-8">
              <select id="sp-type" style="flex:1; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px;"><option value="compute">Compute SP</option><option value="ec2">EC2 Instance SP</option></select>
              <select id="sp-term" style="flex:1; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px;"><option value="1">1 Year</option><option value="3">3 Years</option></select>
              <select id="sp-payment" style="flex:1; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px;"><option value="none">No Upfront</option><option value="partial" selected>Partial Upfront</option><option value="all">All Upfront</option></select>
            </div>
            <div class="flex gap-8 mb-8">
              <div style="flex:1"><label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Commit $/hr</label><input type="number" id="sp-commit" value="${spFindings.length && spFindings[0].hourlyCommitment ? spFindings[0].hourlyCommitment.toFixed(3) : '0.10'}" step="0.001" min="0" style="width:100%; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px; font-family:var(--font-mono);"></div>
              <div style="flex:1"><label class="t3" style="font-size:11px; display:block; margin-bottom:4px;">Current OD $/mo</label><input type="number" id="sp-od" value="${totalSpend > 0 ? totalSpend.toFixed(0) : '500'}" min="0" style="width:100%; padding:6px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--text); font-size:13px; font-family:var(--font-mono);"></div>
            </div>
            <button class="btn btn--accent btn--sm" id="sp-calc" style="width:100%;">Calculate</button>
            <div id="sp-result" class="mt-8"></div>
          </div>
        </div>
      </div>

      <!-- Quick Guide -->
      <div class="card mb-24">
        <h3 class="mb-16">RI vs Savings Plans — Quick Guide</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead><tr style="background:var(--surface);"><th style="padding:10px 14px; text-align:left; border-bottom:1px solid var(--line);"></th><th style="padding:10px 14px; text-align:left; border-bottom:1px solid var(--line);">Reserved Instances</th><th style="padding:10px 14px; text-align:left; border-bottom:1px solid var(--line);">Savings Plans</th></tr></thead>
          <tbody>
            <tr><td style="padding:10px 14px; border-bottom:1px solid var(--line); font-weight:500;">Discount</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">Up to 72% (3yr All Upfront)</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">Up to 66% (3yr All Upfront)</td></tr>
            <tr><td style="padding:10px 14px; border-bottom:1px solid var(--line); font-weight:500;">Flexibility</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">Locked to instance type + region</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">Compute SP: any instance, region, OS</td></tr>
            <tr><td style="padding:10px 14px; border-bottom:1px solid var(--line); font-weight:500;">Best for</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">Steady-state, known instance types</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">Variable workloads, multi-service</td></tr>
            <tr><td style="padding:10px 14px; border-bottom:1px solid var(--line); font-weight:500;">Applies to</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">EC2, RDS, ElastiCache, OpenSearch, Redshift</td><td style="padding:10px 14px; border-bottom:1px solid var(--line);">EC2, Fargate, Lambda (Compute SP)</td></tr>
            <tr><td style="padding:10px 14px; font-weight:500;">Recommendation</td><td style="padding:10px 14px;">Use for databases (RDS, ElastiCache) with fixed instance types</td><td style="padding:10px 14px;">Use for EC2/Fargate when you may change instance types</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  return { overview, findings, compliance, investigate, history, accounts, scan, team, report, cost };
})();
