/* ================ PAGES ================ */
window.PAGES = (() => {
  const D = window.DATA;

  // ---------- helpers ----------
  const sevBadge = s => `<span class="badge badge--${({CRITICAL:'crit',HIGH:'high',MEDIUM:'med',LOW:'low',INFORMATIONAL:'info'})[s]}">${s}</span>`;
  const sevSq = s => `<span class="sq sq--${({CRITICAL:'crit',HIGH:'high',MEDIUM:'med',LOW:'low',INFORMATIONAL:'info'})[s]}"></span>`;
  const heatColor = v => {
    // v 0..1 → warm → hot
    const pct = Math.round(v*100);
    const hue = 30 + (1-v) * 80; // low→greenish, high→red
    return `hsl(${hue} 65% ${92 - v*45}%)`;
  };
  const money = n => '$' + n.toLocaleString('en-US');

  function pageHeader({eyebrow, title, sub, actions=''}) {
    return `
      <section class="ph">
        <div>
          <div class="ph__eyebrow">${eyebrow}</div>
          <h1 class="display">${title}</h1>
          ${sub ? `<p class="ph__sub">${sub}</p>` : ''}
        </div>
        <div class="ph__meta">${actions}</div>
      </section>
    `;
  }

  // ---------- OVERVIEW ----------
  function overview() {
    const totals = D.accounts.reduce((a,x)=>({crit:a.crit+x.critical,high:a.high+x.high,med:a.med+x.medium,low:a.low+x.low,info:a.info+x.info}),{crit:0,high:0,med:0,low:0,info:0});
    const avgScore = Math.round(D.pillars.reduce((a,p)=>a+p.score,0)/D.pillars.length);

    // Radar SVG
    const N = 5, R = 110, CX=130, CY=130;
    const pts = D.pillars.map((p,i)=>{
      const a = -Math.PI/2 + (Math.PI*2*i/N);
      const r = R * (p.score/100);
      return [CX + Math.cos(a)*r, CY + Math.sin(a)*r];
    });
    const gridRings = [0.25,0.5,0.75,1].map(f=>{
      const ring = D.pillars.map((_,i)=>{
        const a = -Math.PI/2 + (Math.PI*2*i/N);
        return [CX+Math.cos(a)*R*f, CY+Math.sin(a)*R*f];
      });
      return `<polygon points="${ring.map(p=>p.join(',')).join(' ')}" fill="none" stroke="var(--line-2)" stroke-width="1"/>`;
    }).join('');
    const spokes = D.pillars.map((p,i)=>{
      const a = -Math.PI/2 + (Math.PI*2*i/N);
      const x = CX+Math.cos(a)*R, y = CY+Math.sin(a)*R;
      const lx = CX+Math.cos(a)*(R+16), ly = CY+Math.sin(a)*(R+16);
      return `<line x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" stroke="var(--line-2)" stroke-width="1"/>
              <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="var(--text-3)" font-family="var(--font-ui)">${p.id}</text>`;
    }).join('');
    const area = `<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="color-mix(in oklab, var(--ac-500) 22%, transparent)" stroke="var(--ac-500)" stroke-width="1.8"/>`;
    const dots = pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--ac-500)"/>`).join('');

    // Heatmap
    const heatServices = ['EC2','S3','IAM','RDS','Lambda','EKS'];
    const heatRows = heatServices.map(s=>{
      const cells = D.pillars.map(p=>{
        const v = Math.random()*.7 + .1;
        return `<div class="heat__cell" style="background:${heatColor(v)}">${Math.round(v*100)}</div>`;
      }).join('');
      return `<div class="heat__row-label">${s}</div>${cells}`;
    }).join('');

    return `
      ${pageHeader({
        eyebrow:'Monitor · Overview',
        title:`Your cloud, <em>at a glance.</em>`,
        sub:'ภาพรวม Well-Architected Review ครอบคลุม 4 บัญชี AWS · อัปเดตล่าสุด 2 นาทีที่แล้ว',
        actions:`<span class="dot"></span><span>Scan healthy</span><span class="t3">·</span><span>Next scan 14:00 GMT+7</span>`
      })}

      <div class="grid grid-4 mb-24">
        <div class="kpi">
          <div class="kpi__label">Overall Score</div>
          <div class="kpi__val">${avgScore}</div>
          <span class="kpi__delta kpi__delta--good">▲ 4 pts vs last week</span>
          <svg class="kpi__spark" width="72" height="28" viewBox="0 0 72 28"><polyline points="0,20 12,16 24,18 36,12 48,14 60,8 72,6" fill="none" stroke="var(--ac-500)" stroke-width="1.6"/></svg>
        </div>
        <div class="kpi">
          <div class="kpi__label">Total Findings</div>
          <div class="kpi__val">${totals.crit+totals.high+totals.med+totals.low+totals.info}</div>
          <span class="kpi__delta kpi__delta--bad">▲ 12 new</span>
        </div>
        <div class="kpi">
          <div class="kpi__label">Critical · High</div>
          <div class="kpi__val" style="color:var(--s-crit)">${totals.crit + totals.high}</div>
          <span class="kpi__delta kpi__delta--good">▼ 3 resolved</span>
        </div>
        <div class="kpi">
          <div class="kpi__label">Accounts Scanned</div>
          <div class="kpi__val">${D.accounts.length}<span style="font-size:16px;color:var(--text-3)"> / ${D.accounts.length}</span></div>
          <span class="kpi__delta kpi__delta--good">✓ All green</span>
        </div>
      </div>

      <div class="grid grid-5 mb-24">
        ${D.pillars.map(p => `
          <div class="pillar">
            <div class="pillar__head">
              <span class="pillar__name">${p.name}</span>
              <span class="pillar__score" style="color:${p.score>=75?'var(--s-low)':p.score>=60?'var(--s-med)':'var(--s-crit)'}">${p.score}</span>
            </div>
            <div class="pillar__bar"><span style="width:${p.score}%;background:${p.score>=75?'var(--s-low)':p.score>=60?'var(--s-med)':'var(--s-crit)'}"></span></div>
            <div class="pillar__sev">
              <span><span class="sq sq--crit"></span> <b>${p.crit}</b></span>
              <span><span class="sq sq--high"></span> <b>${p.high}</b></span>
              <span><span class="sq sq--med"></span> <b>${p.med}</b></span>
              <span><span class="sq sq--low"></span> <b>${p.low}</b></span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="grid grid-2 mb-24">
        <div class="card">
          <div class="card__head">
            <h3>Pillar Radar</h3>
            <span class="t3 mono">ล่าสุด · ${new Date().toISOString().slice(0,10)}</span>
          </div>
          <div class="radar">
            <svg viewBox="0 0 260 260">
              ${gridRings}${spokes}${area}${dots}
            </svg>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <h3>Service × Pillar</h3>
            <span class="t3">heat = # issues</span>
          </div>
          <div class="heat">
            <div></div>
            ${D.pillars.map(p=>`<div class="heat__col-label">${p.id}</div>`).join('')}
            ${heatRows}
          </div>
        </div>
      </div>

      <div class="card card--flush mb-24">
        <div class="card__head" style="padding:20px 24px 0">
          <h3>Account Summary</h3>
          <a href="#accounts" class="btn btn--sm btn--ghost" data-route="accounts">Manage accounts →</a>
        </div>
        <table class="tbl">
          <thead><tr><th>Alias</th><th>Account ID</th><th>Environment</th><th>Region</th><th>Critical</th><th>High</th><th>Medium</th><th>Total</th></tr></thead>
          <tbody>
            ${D.accounts.map(a => `
              <tr>
                <td><strong>${a.alias}</strong></td>
                <td class="mono">${a.id}</td>
                <td>${a.env}</td>
                <td class="mono">${a.region}</td>
                <td><span class="badge badge--crit">${a.critical}</span></td>
                <td><span class="badge badge--high">${a.high}</span></td>
                <td><span class="badge badge--med">${a.medium}</span></td>
                <td><strong>${a.critical+a.high+a.medium+a.low+a.info}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------- FINDINGS ----------
  function findings() {
    const rows = D.findings.map(f => `
      <tr data-id="${f.id}">
        <td class="mono">${f.id}</td>
        <td>${f.service}</td>
        <td class="mono" style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.resource}</td>
        <td>${f.pillar}</td>
        <td>${sevBadge(f.severity)}</td>
        <td>${f.title}</td>
        <td><span class="chip">${f.account}</span></td>
      </tr>
    `).join('');

    const uniq = k => [...new Set(D.findings.map(f=>f[k]))];

    return `
      ${pageHeader({
        eyebrow:'Monitor · Findings',
        title:`All the signals, <em>ranked.</em>`,
        sub:`${D.findings.length} open findings ทั่วทั้ง ${D.accounts.length} AWS accounts · เรียงตาม severity และ pillar`,
        actions:`<button class="btn btn--sm"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4h8M2 6h6M2 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> Group</button>
                 <button class="btn btn--sm">Export CSV</button>`
      })}

      <div class="card card--flush">
        <div class="filters">
          <input type="text" placeholder="ค้นหา resource, title…" />
          <select><option>All pillars</option>${D.pillars.map(p=>`<option>${p.name}</option>`).join('')}</select>
          <select><option>All severities</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
          <select><option>All services</option>${uniq('service').map(s=>`<option>${s}</option>`).join('')}</select>
          <select><option>All accounts</option>${uniq('account').map(s=>`<option>${s}</option>`).join('')}</select>
          <div class="filters__sep"></div>
          <span class="chip">${D.findings.length} results</span>
          <button class="btn btn--sm btn--ghost">Clear</button>
        </div>
        <table class="tbl">
          <thead><tr><th>ID</th><th>Service</th><th>Resource</th><th>Pillar</th><th>Severity</th><th>Title</th><th>Account</th></tr></thead>
          <tbody id="findings-tbody">${rows}</tbody>
        </table>
      </div>

      <!-- drawer -->
      <div class="drawer" id="drawer">
        <div class="drawer__bd" data-drawer-close></div>
        <div class="drawer__box">
          <button class="icon-btn drawer__close" data-drawer-close>×</button>
          <div id="drawer-body"></div>
        </div>
      </div>
    `;
  }

  // ---------- COMPLIANCE ----------
  function compliance() {
    return `
      ${pageHeader({
        eyebrow:'Monitor · Compliance',
        title:`Benchmarks, <em>side by side.</em>`,
        sub:'ผลการตรวจสอบกับ framework มาตรฐาน — คลิกชื่อ framework เพื่อดูรายละเอียดแต่ละ control',
        actions:`<button class="btn btn--sm">Map controls</button>`
      })}

      <div class="grid grid-3 mb-24">
        ${D.frameworks.map(f => {
          const pct = Math.round(f.passed/f.controls*100);
          return `
          <div class="card">
            <div class="flex between center mb-8">
              <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase">${f.id}</div>
              <span class="badge badge--outline">${f.controls} controls</span>
            </div>
            <h3>${f.name}</h3>
            <div class="flex gap-16 center mt-16 mb-16">
              <div style="font-family:var(--font-display); font-size:44px; line-height:1">${pct}<span style="font-size:18px; color:var(--text-3)">%</span></div>
              <div class="t2" style="font-size:13px">${f.passed} / ${f.controls} passed</div>
            </div>
            <div class="pillar__bar"><span style="width:${pct}%;background:${pct>=80?'var(--s-low)':pct>=70?'var(--s-med)':'var(--s-crit)'}"></span></div>
            <div class="flex gap-8 mt-16">
              <button class="btn btn--sm">View report</button>
              <button class="btn btn--sm btn--ghost">Export</button>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="card card--flush">
        <div class="card__head" style="padding:20px 24px 0"><h3>Control Map · WAFS</h3><span class="t3">showing top 12 controls</span></div>
        <table class="tbl">
          <thead><tr><th>Control ID</th><th>Description</th><th>Pillar</th><th>Status</th><th>Resources</th></tr></thead>
          <tbody>
            ${[
              ['SEC-01','MFA enabled on root account','Security','pass',1],
              ['SEC-04','IAM users without console MFA','Security','fail',3],
              ['REL-02','RDS Multi-AZ for production DBs','Reliability','fail',2],
              ['OPS-03','CloudTrail enabled in all regions','Ops','pass',4],
              ['COST-01','EBS volumes unattached >7d','Cost','warn',11],
              ['PERF-02','CloudFront compression enabled','Perf','warn',3],
              ['SEC-07','S3 buckets block public access','Security','pass',18],
              ['SEC-11','KMS key rotation enabled','Security','warn',7],
              ['REL-05','Auto Scaling health checks','Reliability','pass',6],
              ['OPS-07','EKS control plane logs','Ops','fail',1],
              ['COST-04','Savings Plans coverage ≥70%','Cost','fail',1],
              ['SEC-13','GuardDuty enabled all regions','Security','pass',4],
            ].map(r => `
              <tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td>
                <td>${r[3]==='pass'?'<span class="badge badge--low">Pass</span>':r[3]==='fail'?'<span class="badge badge--crit">Fail</span>':'<span class="badge badge--med">Warn</span>'}</td>
                <td class="mono">${r[4]}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------- HISTORY ----------
  function history() {
    const W = 720, H = 200, P = 24;
    const max = 100, min = 40;
    const xs = D.history.map((_,i) => P + (W-2*P) * i/(D.history.length-1));
    const ys = D.history.map(h => H - P - (H-2*P) * (h.score-min)/(max-min));
    const path = xs.map((x,i)=>`${i?'L':'M'} ${x} ${ys[i]}`).join(' ');
    const area = `M ${xs[0]} ${H-P} ${xs.map((x,i)=>`L ${x} ${ys[i]}`).join(' ')} L ${xs[xs.length-1]} ${H-P} Z`;

    return `
      ${pageHeader({
        eyebrow:'Monitor · History',
        title:`Trends over <em>time.</em>`,
        sub:'แนวโน้มคะแนนย้อนหลัง 6 สัปดาห์ — แต่ละจุดคือการสแกนรายสัปดาห์',
        actions:`<button class="btn btn--sm">90d</button><button class="btn btn--sm btn--ghost">All time</button>`
      })}

      <div class="card mb-24">
        <div class="card__head"><h3>Well-Architected Score</h3><span class="t3">6 weeks · rolling</span></div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:220px">
          ${[60,70,80,90].map(v => {
            const y = H - P - (H-2*P) * (v-min)/(max-min);
            return `<line x1="${P}" x2="${W-P}" y1="${y}" y2="${y}" stroke="var(--line-2)" stroke-width="1"/>
                    <text x="${P-6}" y="${y+3}" font-size="10" text-anchor="end" fill="var(--text-3)">${v}</text>`;
          }).join('')}
          <path d="${area}" fill="color-mix(in oklab, var(--ac-500) 16%, transparent)"/>
          <path d="${path}" fill="none" stroke="var(--ac-500)" stroke-width="2"/>
          ${xs.map((x,i)=>`<circle cx="${x}" cy="${ys[i]}" r="4" fill="var(--surface-2)" stroke="var(--ac-500)" stroke-width="2"/>
                            <text x="${x}" y="${H-6}" font-size="10" text-anchor="middle" fill="var(--text-3)">${D.history[i].date.slice(5)}</text>`).join('')}
        </svg>
      </div>

      <div class="card card--flush">
        <table class="tbl">
          <thead><tr><th>Date</th><th>Score</th><th>Δ vs previous</th><th>Critical findings</th><th>Triggered by</th><th></th></tr></thead>
          <tbody>
            ${D.history.map(h => `
              <tr>
                <td class="mono">${h.date}</td>
                <td><strong>${h.score}</strong></td>
                <td><span class="badge badge--${h.delta.startsWith('+')?'low':'crit'}">${h.delta}</span></td>
                <td>${h.crit}</td>
                <td class="t2">Scheduled · cron</td>
                <td><button class="btn btn--sm btn--ghost">Diff →</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------- ACCOUNTS ----------
  function accounts() {
    return `
      ${pageHeader({
        eyebrow:'Manage · Accounts',
        title:`AWS fleet, <em>connected.</em>`,
        sub:'เชื่อม AWS account ผ่าน read-only IAM role · platform สแกนตามตารางเวลาที่ตั้งไว้',
        actions:`<button class="btn btn--accent btn--sm">+ Add account</button>`
      })}

      <div class="grid grid-3 mb-24">
        ${D.accounts.map(a => `
          <div class="card">
            <div class="flex between center mb-16">
              <div>
                <h3 style="margin-bottom:4px">${a.alias}</h3>
                <div class="mono t3" style="font-size:12px">${a.id}</div>
              </div>
              <span class="badge badge--outline">${a.env}</span>
            </div>
            <div class="flex wrap gap-8 mb-16">
              <span class="chip"><span class="dot"></span> connected</span>
              <span class="chip mono">${a.region}</span>
            </div>
            <div class="flex gap-8 wrap" style="font-size:12px">
              <span class="t3">C <b style="color:var(--s-crit)">${a.critical}</b></span>
              <span class="t3">H <b style="color:var(--s-high)">${a.high}</b></span>
              <span class="t3">M <b style="color:var(--s-med)">${a.medium}</b></span>
              <span class="t3">L <b style="color:var(--s-low)">${a.low}</b></span>
              <span class="t3">I <b>${a.info}</b></span>
            </div>
            <div class="flex gap-8 mt-16">
              <button class="btn btn--sm">Scan now</button>
              <button class="btn btn--sm btn--ghost">Settings</button>
            </div>
          </div>
        `).join('')}

        <button class="card" style="border:1.5px dashed var(--line-2); background:transparent; min-height:220px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--text-3); cursor:pointer">
          <svg width="36" height="36" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <span>เชื่อม AWS account ใหม่</span>
          <span class="mono" style="font-size:11px">CloudFormation 1-click</span>
        </button>
      </div>
    `;
  }

  // ---------- SCAN ----------
  function scan() {
    return `
      ${pageHeader({
        eyebrow:'Manage · Scan',
        title:`Run a review, <em>now.</em>`,
        sub:'เลือก account และ pillar ที่ต้องการตรวจ · ระบบจะประเมินผ่าน rule engine แบบ plugin-based',
        actions:`<button class="btn btn--accent">▶ Start scan</button>`
      })}

      <div class="grid grid-2 mb-24">
        <div class="card">
          <div class="card__head"><h3>Configure scan</h3></div>

          <div class="mb-24">
            <div class="t3 mb-8" style="font-size:11.5px; letter-spacing:.08em; text-transform:uppercase">Accounts</div>
            <div class="flex gap-8 wrap">
              ${D.accounts.map(a=>`<label class="chip"><input type="checkbox" checked style="accent-color:var(--ac-500)"/> ${a.alias}</label>`).join('')}
            </div>
          </div>

          <div class="mb-24">
            <div class="t3 mb-8" style="font-size:11.5px; letter-spacing:.08em; text-transform:uppercase">Pillars</div>
            <div class="flex gap-8 wrap">
              ${D.pillars.map(p=>`<label class="chip"><input type="checkbox" checked style="accent-color:var(--ac-500)"/> ${p.name}</label>`).join('')}
            </div>
          </div>

          <div class="mb-24">
            <div class="t3 mb-8" style="font-size:11.5px; letter-spacing:.08em; text-transform:uppercase">Regions</div>
            <div class="flex gap-8 wrap">
              ${['ap-southeast-1','ap-southeast-7','us-east-1','eu-west-1'].map(r=>`<label class="chip"><input type="checkbox" style="accent-color:var(--ac-500)" ${r==='ap-southeast-1'?'checked':''}/> <span class="mono">${r}</span></label>`).join('')}
            </div>
          </div>

          <div class="mb-24">
            <div class="t3 mb-8" style="font-size:11.5px; letter-spacing:.08em; text-transform:uppercase">Frameworks</div>
            <div class="flex gap-8 wrap">
              ${D.frameworks.map(f=>`<label class="chip"><input type="checkbox" ${f.id==='wafs'?'checked':''} style="accent-color:var(--ac-500)"/> ${f.name}</label>`).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><h3>Recent scans</h3><span class="t3">24h</span></div>
          <div class="tl">
            ${[
              ['14:02','com7-prod','completed','73 findings'],
              ['12:38','com7-staging','completed','46 findings'],
              ['10:14','com7-dev','completed','47 findings'],
              ['08:00','All accounts','scheduled','—'],
            ].map(r=>`
              <div class="tl__row">
                <div class="flex between center">
                  <div>
                    <div class="mono t3" style="font-size:12px">${r[0]}</div>
                    <div style="font-weight:500">${r[1]}</div>
                  </div>
                  <span class="badge badge--${r[2]==='completed'?'low':'info'}">${r[2]}</span>
                </div>
                <div class="t2 mt-8" style="font-size:13px">${r[3]}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><h3>Schedule</h3></div>
        <div class="flex gap-16 wrap">
          <label class="chip"><input type="radio" name="sched" style="accent-color:var(--ac-500)"/> Manual only</label>
          <label class="chip"><input type="radio" name="sched" checked style="accent-color:var(--ac-500)"/> Daily · 08:00 GMT+7</label>
          <label class="chip"><input type="radio" name="sched" style="accent-color:var(--ac-500)"/> Weekly · Mondays 08:00</label>
          <label class="chip"><input type="radio" name="sched" style="accent-color:var(--ac-500)"/> Custom cron…</label>
        </div>
      </div>
    `;
  }

  // ---------- TEAM ----------
  function team() {
    return `
      ${pageHeader({
        eyebrow:'Manage · Team',
        title:`People & <em>permissions.</em>`,
        sub:'ผู้ใช้ทั้งหมดใน workspace นี้ · จัดการผ่าน Cognito User Pool',
        actions:`<button class="btn btn--accent btn--sm">+ Invite</button>`
      })}

      <div class="card card--flush">
        <table class="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last active</th><th></th></tr></thead>
          <tbody>
            ${D.team.map(m=>`
              <tr>
                <td>
                  <div class="flex gap-8 center">
                    <div class="avatar" style="width:28px; height:28px; font-size:10px">${m.name.split(' ').map(s=>s[0]).join('').slice(0,2)}</div>
                    <strong>${m.name}</strong>
                  </div>
                </td>
                <td class="mono t2">${m.email}</td>
                <td><span class="badge badge--${m.role==='Admin'?'crit':m.role==='Auditor'?'med':m.role==='Service'?'info':'low'}">${m.role}</span></td>
                <td class="t2">${m.last}</td>
                <td style="text-align:right"><button class="btn btn--sm btn--ghost">Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------- REPORT ----------
  function report() {
    return `
      ${pageHeader({
        eyebrow:'Reports · Executive',
        title:`Audit-ready, <em>ready in seconds.</em>`,
        sub:'สร้างรายงาน PDF สำหรับผู้บริหารหรือ audit · รวมคะแนน, finding, และแผนการแก้ไขในไฟล์เดียว',
        actions:`<button class="btn btn--accent">⬇ Generate PDF</button>`
      })}

      <div class="grid grid-2 mb-24">
        <div class="card">
          <h3 class="mb-16">Report content</h3>
          ${['Executive summary', 'Pillar-by-pillar breakdown', 'All findings with remediation', 'Compliance framework mapping', 'Cost optimisation opportunities', 'Historical trend (90d)', 'Team & audit trail'].map(x=>`
            <label class="flex between center" style="padding:10px 0; border-bottom:1px solid var(--line)">
              <span>${x}</span>
              <input type="checkbox" checked style="accent-color:var(--ac-500)"/>
            </label>
          `).join('')}
        </div>

        <div class="card" style="background:linear-gradient(135deg, var(--ac-100) 0%, var(--surface-2) 60%)">
          <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac-600)">Preview</div>
          <h2 style="font-family:var(--font-display); font-size:34px; line-height:1.1; margin:14px 0 12px">AWS Well-Architected Review · Q2 2026</h2>
          <p class="t2" style="font-size:14px">Prepared for <strong>Com7 Business</strong> · 4 accounts · ap-southeast-1 + 2 more</p>
          <hr style="border:0; border-top:1px solid var(--line); margin:24px 0">
          <div class="flex between" style="font-size:13px">
            <div><div class="t3">Score</div><div style="font-family:var(--font-display); font-size:32px">73</div></div>
            <div><div class="t3">Findings</div><div style="font-family:var(--font-display); font-size:32px">${D.findings.length}</div></div>
            <div><div class="t3">Critical</div><div style="font-family:var(--font-display); font-size:32px; color:var(--s-crit)">6</div></div>
          </div>
          <hr style="border:0; border-top:1px solid var(--line); margin:24px 0">
          <p class="t2" style="font-size:13px">Generated by WA Review Platform · konsudtai@com7.co.th</p>
        </div>
      </div>

      <div class="card">
        <h3 class="mb-16">Past reports</h3>
        ${[
          ['2026-Q1-executive.pdf','1.2 MB','konsudtai','2026-03-31'],
          ['2025-Q4-audit.pdf','1.4 MB','konsudtai','2025-12-20'],
          ['2025-Q4-soc2-evidence.zip','6.1 MB','SecOps Bot','2025-12-15'],
        ].map(r=>`
          <div class="flex between center" style="padding:12px 0; border-bottom:1px solid var(--line)">
            <div><strong class="mono">${r[0]}</strong><div class="t3" style="font-size:12px">${r[1]} · by ${r[2]}</div></div>
            <div class="flex gap-8 center"><span class="t3 mono">${r[3]}</span><button class="btn btn--sm btn--ghost">Download</button></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ---------- COST ----------
  function cost() {
    const total = D.costOpps.reduce((a,x)=>a+x.saving,0);
    const max = Math.max(...D.costOpps.map(x=>x.saving));
    return `
      ${pageHeader({
        eyebrow:'Reports · CloudFinOps',
        title:`Save <em>${money(total)}</em> / month.`,
        sub:'โอกาสประหยัดค่าใช้จ่าย AWS จากการวิเคราะห์ทรัพยากร idle, over-provisioned และ pricing model',
        actions:`<button class="btn btn--sm">Export to Jira</button>`
      })}

      <div class="grid grid-3 mb-24">
        <div class="kpi"><div class="kpi__label">Identified savings · monthly</div><div class="kpi__val">${money(total)}</div><span class="kpi__delta kpi__delta--good">${D.costOpps.length} opportunities</span></div>
        <div class="kpi"><div class="kpi__label">Annualised impact</div><div class="kpi__val">${money(total*12)}</div><span class="kpi__delta kpi__delta--good">ประมาณการ · 12 เดือน</span></div>
        <div class="kpi"><div class="kpi__label">Implementation effort</div><div class="kpi__val">Low</div><span class="kpi__delta kpi__delta--good">ส่วนใหญ่ทำได้ภายใน 1 สัปดาห์</span></div>
      </div>

      <div class="card card--flush">
        <div class="card__head" style="padding:20px 24px 0"><h3>Optimisation Opportunities</h3><span class="t3">ranked by savings</span></div>
        <table class="tbl">
          <thead><tr><th>Opportunity</th><th>Account</th><th>Resources</th><th style="width:30%">Monthly savings</th><th></th></tr></thead>
          <tbody>
            ${D.costOpps.map(o=>`
              <tr>
                <td><strong>${o.title}</strong></td>
                <td><span class="chip">${o.account}</span></td>
                <td class="mono">${o.count}</td>
                <td>
                  <div class="flex gap-16 center">
                    <strong style="font-family:var(--font-display); font-size:20px; min-width:80px">${money(o.saving)}</strong>
                    <div class="bar" style="flex:1"><span style="width:${o.saving/max*100}%"></span></div>
                  </div>
                </td>
                <td style="text-align:right"><button class="btn btn--sm">Apply</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  return { overview, findings, compliance, history, accounts, scan, team, report, cost };
})();
