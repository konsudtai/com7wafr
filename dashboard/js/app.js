/* ================ APP ================ */
window.App = {};
(() => {
  // Auth state
  const state = { isAuthenticated: false, user: null, role: null };

  // Login page renderer
  function loginPage() {
    return `
      <div style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
        <div style="background:var(--surface-2); border-radius:var(--r-xl); padding:40px; width:100%; max-width:400px; box-shadow:var(--shadow-2); text-align:center;">
          <div style="color:var(--ac-500); margin-bottom:16px;">
            <svg viewBox="0 0 24 24" width="32" height="32"><path d="M3 12 L12 3 L21 12 L12 21 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 12 L12 7 L17 12 L12 17 Z" fill="currentColor"/></svg>
          </div>
          <h2 style="font-family:var(--font-display); margin-bottom:4px; font-weight:700; letter-spacing:-.01em;">AWS WA Review</h2>
          <p class="t2" style="margin-bottom:24px; font-size:14px;">Well-Architected Intelligence</p>
          <form id="login-form" autocomplete="on">
            <div style="margin-bottom:12px; text-align:left;">
              <label style="font-size:12px; color:var(--text-3); display:block; margin-bottom:4px;">Email</label>
              <input type="email" id="login-email" placeholder="email@example.com" required autocomplete="username" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:14px;">
            </div>
            <div style="margin-bottom:12px; text-align:left;">
              <label style="font-size:12px; color:var(--text-3); display:block; margin-bottom:4px;">Password</label>
              <div style="position:relative;">
                <input type="password" id="login-password" placeholder="Password" required autocomplete="current-password" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:14px; padding-right:44px;">
                <button type="button" id="toggle-pw" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:var(--text-3); font-size:12px;">Show</button>
              </div>
            </div>
            <div id="login-error" style="display:none; padding:8px; border-radius:var(--r-sm); background:color-mix(in oklab, var(--s-crit) 12%, transparent); color:var(--s-crit); font-size:13px; margin-bottom:12px;"></div>
            <button type="submit" id="login-submit" class="btn btn--accent" style="width:100%; height:38px; justify-content:center;">Sign in</button>
          </form>
          <div id="change-pw-form" style="display:none;">
            <p class="t2" style="margin-bottom:12px; font-size:13px;">Set a new password for first login</p>
            <input type="password" id="new-pw" placeholder="New password" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:14px; margin-bottom:8px;">
            <input type="password" id="confirm-pw" placeholder="Confirm password" style="width:100%; padding:8px 12px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:14px; margin-bottom:12px;">
            <div id="pw-error" style="display:none; padding:8px; border-radius:var(--r-sm); background:color-mix(in oklab, var(--s-crit) 12%, transparent); color:var(--s-crit); font-size:13px; margin-bottom:12px;"></div>
            <button id="pw-submit" class="btn btn--accent" style="width:100%; height:38px; justify-content:center;">Change password</button>
          </div>
          <div style="margin-top:28px; padding-top:16px; border-top:1px solid var(--line);">
            <div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:6px;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304 182" width="60" height="36" style="opacity:.85;"><path d="M86.4 66.4c0 3.7.4 6.7 1.1 8.9.8 2.2 1.8 4.6 3.2 7.2.5.8.7 1.6.7 2.3 0 1-.6 2-1.9 3l-6.3 4.2c-.9.6-1.8.9-2.6.9-1 0-2-.5-3-1.4-1.4-1.5-2.6-3.1-3.6-4.7-1-1.7-2-3.6-3.1-5.9-7.8 9.2-17.6 13.8-29.4 13.8-8.4 0-15.1-2.4-20-7.2-4.9-4.8-7.4-11.2-7.4-19.2 0-8.5 3-15.4 9.1-20.6 6.1-5.2 14.2-7.8 24.5-7.8 3.4 0 6.9.3 10.6.8 3.7.5 7.5 1.3 11.5 2.2v-7.3c0-7.6-1.6-12.9-4.7-16-3.2-3.1-8.6-4.6-16.3-4.6-3.5 0-7.1.4-10.8 1.3-3.7.9-7.3 2-10.8 3.4-1.6.7-2.8 1.1-3.5 1.3-.7.2-1.2.3-1.6.3-1.4 0-2.1-1-2.1-3.1v-4.9c0-1.6.2-2.8.7-3.5.5-.7 1.4-1.4 2.8-2.1 3.5-1.8 7.7-3.3 12.6-4.5C41 1.9 46.2 1.3 51.7 1.3c12.2 0 21.1 2.8 26.8 8.3 5.6 5.6 8.4 14 8.4 25.4v33.4h-.5zM45.8 81.6c3.3 0 6.7-.6 10.3-1.8 3.6-1.2 6.8-3.4 9.5-6.4 1.6-1.9 2.8-4 3.4-6.4.6-2.4 1-5.3 1-8.7v-4.2c-2.9-.7-6-1.3-9.2-1.7-3.2-.4-6.3-.6-9.4-.6-6.7 0-11.6 1.3-14.9 4-3.3 2.7-4.9 6.5-4.9 11.5 0 4.7 1.2 8.2 3.7 10.6 2.4 2.5 5.9 3.7 10.5 3.7zm80.3 10.8c-1.8 0-3-.3-3.8-1-.8-.6-1.5-2-2.1-3.9L96.7 10.2c-.6-2-.9-3.3-.9-4 0-1.6.8-2.5 2.4-2.5h9.8c1.9 0 3.2.3 3.9 1 .8.6 1.4 2 2 3.9l16.8 66.2 15.6-66.2c.5-2 1.1-3.3 1.9-3.9.8-.6 2.2-1 4-1h8c1.9 0 3.2.3 4 1 .8.6 1.5 2 1.9 3.9l15.8 67 17.3-67c.6-2 1.3-3.3 2-3.9.8-.6 2.1-1 3.9-1h9.3c1.6 0 2.5.8 2.5 2.5 0 .5-.1 1-.2 1.6-.1.6-.3 1.4-.7 2.5l-24.1 77.3c-.6 2-1.3 3.3-2.1 3.9-.8.6-2.1 1-3.8 1h-8.6c-1.9 0-3.2-.3-4-1-.8-.7-1.5-2-1.9-4L156 23l-15.4 64.4c-.5 2-1.1 3.3-1.9 4-.8.7-2.2 1-4 1h-8.6zm128.5 2.7c-5.2 0-10.4-.6-15.4-1.8-5-1.2-8.9-2.5-11.5-4-1.6-.9-2.7-1.9-3.1-2.8-.4-.9-.6-1.9-.6-2.8v-5.1c0-2.1.8-3.1 2.3-3.1.6 0 1.2.1 1.8.3.6.2 1.5.6 2.5 1 3.4 1.5 7.1 2.7 11 3.5 4 .8 7.9 1.2 11.9 1.2 6.3 0 11.2-1.1 14.6-3.3 3.4-2.2 5.2-5.4 5.2-9.5 0-2.8-.9-5.1-2.7-7-1.8-1.9-5.2-3.6-10.1-5.2L246 52c-7.3-2.3-12.7-5.7-16-10.2-3.3-4.4-5-9.3-5-14.5 0-4.2.9-7.9 2.7-11.1 1.8-3.2 4.2-6 7.2-8.2 3-2.3 6.4-4 10.4-5.2 4-1.2 8.2-1.7 12.6-1.7 2.2 0 4.5.1 6.7.4 2.3.3 4.4.7 6.5 1.1 2 .5 3.9 1 5.7 1.6 1.8.6 3.2 1.2 4.2 1.8 1.4.8 2.4 1.6 3 2.5.6.8.9 1.8.9 3.3v4.7c0 2.1-.8 3.2-2.3 3.2-.8 0-2.1-.4-3.8-1.2-5.7-2.6-12.1-3.9-19.2-3.9-5.7 0-10.2.9-13.3 2.8-3.1 1.9-4.7 4.8-4.7 8.9 0 2.8 1 5.2 3 7.1 2 1.9 5.7 3.8 11 5.5l14.2 4.5c7.2 2.3 12.4 5.5 15.5 9.6 3.1 4.1 4.6 8.8 4.6 14 0 4.3-.9 8.2-2.6 11.6-1.8 3.4-4.2 6.4-7.3 8.8-3.1 2.5-6.8 4.3-11.1 5.6-4.5 1.4-9.2 2.1-14.3 2.1z" fill="#252F3E"/><path d="M273.5 143.7c-32.9 24.3-80.7 37.2-121.8 37.2-57.6 0-109.5-21.3-148.7-56.7-3.1-2.8-.3-6.6 3.4-4.4 42.4 24.6 94.7 39.5 148.8 39.5 36.5 0 76.6-7.6 113.5-23.2 5.5-2.5 10.2 3.6 4.8 7.6z" fill="#FF9900"/><path d="M287.2 128.1c-4.2-5.4-27.8-2.6-38.5-1.3-3.2.4-3.7-2.4-.8-4.5 18.8-13.2 49.7-9.4 53.3-5 3.6 4.5-1 35.4-18.6 50.2-2.7 2.3-5.3 1.1-4.1-1.9 4-9.9 12.9-32.2 8.7-37.5z" fill="#FF9900"/></svg>
              <img src="img/com7-logo.avif" alt="Com7 Business" style="height:47px; opacity:.85; position:relative; top:-4px;">
            </div>
            <div style="font-size:11px; color:var(--text-3);">Powered by Com7 Business</div>
          </div>
        </div>
      </div>
    `;
  }

  function wireLogin() {
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pw = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      const btn = document.getElementById('login-submit');
      if (!email || !pw) return;
      btn.disabled = true; btn.textContent = 'Signing in...';
      errEl.style.display = 'none';
      try {
        const result = await Auth.login(email, pw);
        if (result.newPasswordRequired) {
          document.getElementById('login-form').style.display = 'none';
          document.getElementById('change-pw-form').style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = err.message || 'Login failed';
        errEl.style.display = 'block';
      } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
    });
    document.getElementById('toggle-pw')?.addEventListener('click', () => {
      const inp = document.getElementById('login-password');
      const btn = document.getElementById('toggle-pw');
      if (inp.type === 'password') { inp.type = 'text'; btn.textContent = 'Hide'; }
      else { inp.type = 'password'; btn.textContent = 'Show'; }
    });
    document.getElementById('pw-submit')?.addEventListener('click', async () => {
      const pw = document.getElementById('new-pw').value;
      const cpw = document.getElementById('confirm-pw').value;
      const errEl = document.getElementById('pw-error');
      if (pw !== cpw) { errEl.textContent = 'Passwords do not match'; errEl.style.display = 'block'; return; }
      if (pw.length < 8) { errEl.textContent = 'Min 8 characters'; errEl.style.display = 'block'; return; }
      try { await Auth.completeNewPassword(pw); } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    });
  }

  const routes = {
    overview:  { group:'monitor', label:'Overview',    render: PAGES.overview,  subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['investigate','Investigate'],['history','History']] },
    findings:  { group:'monitor', label:'Findings',    render: PAGES.findings,  subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['investigate','Investigate'],['history','History']] },
    compliance:{ group:'monitor', label:'Compliance',  render: PAGES.compliance,subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['investigate','Investigate'],['history','History']] },
    investigate:{ group:'monitor', label:'Investigate', render: PAGES.investigate,subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['investigate','Investigate'],['history','History']] },
    history:   { group:'monitor', label:'History',     render: PAGES.history,   subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['investigate','Investigate'],['history','History']] },
    accounts:  { group:'manage',  label:'Accounts',    render: PAGES.accounts,  subtabs:[['accounts','Accounts'],['scan','Scan'],['team','Team']] },
    scan:      { group:'manage',  label:'Scan',        render: PAGES.scan,      subtabs:[['accounts','Accounts'],['scan','Scan'],['team','Team']] },
    team:      { group:'manage',  label:'Team',        render: PAGES.team,      subtabs:[['accounts','Accounts'],['scan','Scan'],['team','Team']] },
    report:    { group:'reports', label:'Report',      render: PAGES.report,    subtabs:[['report','Executive'],['cost','CloudFinOps']] },
    cost:      { group:'reports', label:'CloudFinOps', render: PAGES.cost,      subtabs:[['report','Executive'],['cost','CloudFinOps']] },
  };
  const groupLabel = { monitor:'Monitor', manage:'Manage', reports:'Reports' };

  function routeFromHash() {
    const h = (location.hash || '#overview').slice(1);
    return routes[h] ? h : 'overview';
  }

  function renderSubbar(key) {
    const r = routes[key]; if (!r) return;
    const el = document.getElementById('subbar');
    el.classList.add('show');
    const acctOptions = DATA.accounts.length
      ? '<option value="">All Accounts</option>' + DATA.accounts.map(a => '<option value="' + a.id + '"' + (DATA.selectedAccount === a.id ? ' selected' : '') + '>' + (a.alias || a.id) + ' (' + a.id + ')</option>').join('')
      : '<option value="">No accounts</option>';
    el.innerHTML = `
      <div class="subbar__inner">
        <div class="subbar__crumbs">
          <strong>${groupLabel[r.group]}</strong>
          <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 1 L6 4 L2 7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
          <span>${r.label}</span>
        </div>
        <div class="subbar__tabs">
          ${r.subtabs.map(([k,lbl]) => `<a class="subtab ${k===key?'active':''}" href="#${k}" data-route="${k}">${lbl}</a>`).join('')}
        </div>
        <div class="subbar__actions">
          <select id="global-acct-filter" style="padding:4px 10px; border:1px solid var(--line-2); border-radius:var(--r-sm); background:var(--surface); color:var(--text); font-size:12px; min-width:140px;">${acctOptions}</select>
          <span class="iconchip"><span class="dot"></span> Live</span>
        </div>
      </div>
    `;
    document.getElementById('global-acct-filter')?.addEventListener('change', (e) => {
      DATA.selectedAccount = e.target.value || '';
      render();
    });
  }

  function go(key) { location.hash = '#' + key; }

  async function render() {
    const key = routeFromHash();
    if (!state.isAuthenticated) {
      document.getElementById('topnav').style.display = 'none';
      document.querySelector('.foot').style.display = 'none';
      document.getElementById('main').innerHTML = loginPage();
      wireLogin();
      return;
    }
    document.getElementById('topnav').style.display = '';
    document.querySelector('.foot').style.display = '';
    if (!DATA.loaded) {
      document.getElementById('main').innerHTML = '<div class="empty"><h3>Loading data...</h3><p>Fetching scan results from API</p></div>';
      await DATA.load();
    }
    const r = routes[key];
    document.getElementById('main').innerHTML = r.render();
    renderSubbar(key);
    document.querySelectorAll('.nav__item').forEach(n => n.classList.toggle('active-group', n.dataset.group === r.group));
    document.querySelectorAll('.nav__item.open').forEach(n => n.classList.remove('open'));
    window.scrollTo({top:0, behavior:'instant'});

    // Wire page-specific interactions
    wireFindings();
    wireFilters();
    wireScan();
    wireAccounts();
    wireTeam();
    wireReport();
    wireAvatarMenu();
    wireFinOps();
    wireCompliance();
    wireInvestigate();
    wireAIChat();

    // Update avatar
    const avatarBtn = document.getElementById('avatarBtn');
    const avatarName = document.getElementById('avatar-name');
    const avatarEmail = document.getElementById('avatar-email');
    if (avatarBtn && state.user) {
      const initials = state.user.split('@')[0].slice(0,2).toUpperCase();
      avatarBtn.textContent = initials;
      avatarBtn.title = state.user;
      if (avatarName) avatarName.textContent = state.user.split('@')[0];
      if (avatarEmail) avatarEmail.textContent = state.user;
    }
  }

  // ==================== FINDINGS DRAWER ====================
  function wireFindings() {
    const tbody = document.getElementById('findings-tbody');
    if (!tbody) return;
    const drawer = document.getElementById('drawer');
    const body = document.getElementById('drawer-body');
    tbody.addEventListener('click', e => {
      const tr = e.target.closest('tr'); if (!tr) return;
      const f = DATA.findings.find(x => x.id === tr.dataset.id); if (!f) return;
      const sevClass = {CRITICAL:'crit',HIGH:'high',MEDIUM:'med',LOW:'low',INFORMATIONAL:'info'}[f.severity] || 'info';
      const rec = f.recommendation || 'ปรับตั้งค่า resource นี้ให้สอดคล้องกับแนวปฏิบัติของ AWS Well-Architected Framework ใน pillar ' + f.pillar + ' · อ้างอิงเอกสาร best-practice และใช้ Infrastructure-as-Code เพื่อป้องกันการเกิดซ้ำ';
      body.innerHTML = `
        <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase">${f.service} · ${f.pillar}</div>
        <h2 style="font-family:var(--font-display); font-size:28px; letter-spacing:-.01em; margin:10px 0 12px; line-height:1.15">${f.title}</h2>
        <div class="flex wrap gap-8 mb-24">
          <span class="badge badge--${sevClass}">${f.severity}</span>
          <span class="chip mono">${f.id.slice(0,12)}</span>
          <span class="chip">${f.account}</span>
          <span class="chip mono">${f.region}</span>
          ${f.check_id ? '<span class="chip mono">' + f.check_id + '</span>' : ''}
        </div>
        <div class="t3" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px">Resource</div>
        <div class="mono" style="background:var(--surface); padding:12px; border-radius:8px; font-size:12.5px; margin-bottom:20px; word-break:break-all">${f.resource}</div>
        ${f.description ? '<div class="t3" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px">Description</div><p class="t2" style="margin-bottom:20px">' + f.description + '</p>' : ''}
        <div class="t3" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px">Recommendation</div>
        <p class="t2" style="margin-bottom:20px">${rec}</p>
        <div class="flex gap-8">
          <button class="btn btn--accent btn--sm">Create Jira ticket</button>
          <button class="btn btn--sm">Mark as resolved</button>
          <button class="btn btn--sm btn--ghost">Suppress</button>
        </div>
      `;
      drawer.classList.add('show');
    });
    drawer.addEventListener('click', e => { if (e.target.closest('[data-drawer-close]')) drawer.classList.remove('show'); });
  }

  // ==================== FINDINGS FILTERS ====================
  function wireFilters() {
    const tbody = document.getElementById('findings-tbody');
    if (!tbody) return;
    const search = document.getElementById('f-search');
    const pillar = document.getElementById('f-pillar');
    const sev = document.getElementById('f-sev');
    const svc = document.getElementById('f-svc');
    const acct = document.getElementById('f-acct');
    const countEl = document.getElementById('f-count');
    if (!search) return;

    function applyFilters() {
      const q = (search.value || '').toLowerCase();
      const pv = pillar.value;
      const sv = sev.value;
      const scv = svc.value;
      const av = acct.value;
      let visible = 0;
      tbody.querySelectorAll('tr').forEach(tr => {
        const f = DATA.findings.find(x => x.id === tr.dataset.id);
        if (!f) { tr.style.display = 'none'; return; }
        let show = true;
        if (q && !(f.title.toLowerCase().includes(q) || f.resource.toLowerCase().includes(q) || f.id.toLowerCase().includes(q))) show = false;
        if (pv && f.pillar !== pv) show = false;
        if (sv && f.severity !== sv) show = false;
        if (scv && f.service !== scv) show = false;
        if (av && f.account !== av) show = false;
        tr.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      if (countEl) countEl.textContent = visible + ' results';
    }

    [search, pillar, sev, svc, acct].forEach(el => {
      if (el) el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', applyFilters);
    });
  }

  // ==================== SCAN WIRING ====================
  function wireScan() {
    const btn = document.getElementById('btn-start-scan');
    if (!btn) return;
    let polling = false;

    btn.addEventListener('click', async () => {
      if (polling) return;
      const accts = [...document.querySelectorAll('input[name="s-acct"]:checked')].map(c => c.value);
      const regions = [...document.querySelectorAll('input[name="s-region"]:checked')].map(c => c.value);
      const svcs = [...document.querySelectorAll('input[name="s-svc"]:checked')].map(c => c.value);

      if (!accts.length) { alert('Please select at least one account'); return; }
      if (!regions.length) { alert('Please select at least one region'); return; }
      if (!svcs.length) { alert('Please select at least one service'); return; }

      btn.disabled = true;
      btn.textContent = 'Starting...';
      const statusText = document.getElementById('scan-status-text');
      const progressBar = document.getElementById('scan-progress');

      try {
        const res = await ApiClient.post('/scans', { accounts: accts, regions: regions, services: svcs });
        const scanId = res.scanId;
        if (statusText) statusText.textContent = 'Scan started — ' + scanId.slice(0,8);
        polling = true;

        // Poll for progress
        const poll = setInterval(async () => {
          try {
            const st = await ApiClient.get('/scans/' + scanId + '/status');
            const pct = st.progress || 0;
            if (progressBar) progressBar.style.width = pct + '%';
            const svcLabel = st.currentService ? ' · ' + st.currentService : '';
            const regionLabel = st.currentRegion ? ' · ' + st.currentRegion : '';
            if (statusText) statusText.textContent = st.status + ' ' + pct + '%' + svcLabel + regionLabel;

            if (st.status === 'COMPLETED' || st.status === 'FAILED') {
              clearInterval(poll);
              polling = false;
              btn.disabled = false;
              btn.textContent = 'Start scan';
              if (progressBar) progressBar.style.width = '100%';
              if (statusText) statusText.textContent = st.status === 'COMPLETED'
                ? 'Scan completed — ' + (st.totalFindings || 0) + ' findings'
                : 'Scan failed';
              // Reload data
              DATA.loaded = false;
              await DATA.load();
            }
          } catch (err) {
            if (statusText) statusText.textContent = 'Error polling: ' + err.message;
          }
        }, 3000);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Start scan';
        if (statusText) statusText.textContent = 'Error: ' + err.message;
      }
    });
  }

  // ==================== ACCOUNTS WIRING (4-step wizard) ====================
  function wireAccounts() {
    const btn1 = document.getElementById('btn-add-acct');
    const btn2 = document.getElementById('btn-add-acct2');
    if (!btn1 && !btn2) return;

    const platformId = (window.WA_CONFIG && window.WA_CONFIG.PLATFORM_ACCOUNT_ID) || '';

    function showWizard() {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.id = 'acct-wizard-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `
        <div style="background:var(--surface-2);border-radius:var(--r-xl);padding:32px;width:100%;max-width:560px;box-shadow:var(--shadow-2);max-height:90vh;overflow-y:auto;">
          <div class="flex between center mb-24">
            <h2 style="font-family:var(--font-display);font-size:24px;">Add AWS Account</h2>
            <button class="icon-btn" id="wiz-close" style="font-size:18px;">x</button>
          </div>
          <div id="wiz-steps">
            <!-- Step 1: Account Info -->
            <div id="wiz-step-1">
              <div class="t3 mb-8" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Step 1 of 4 — Account Information</div>
              <div style="margin-bottom:16px;">
                <label style="font-size:13px;display:block;margin-bottom:4px;">Target Account ID (12 digits)</label>
                <input type="text" id="wiz-acct-id" placeholder="123456789012" maxlength="12" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;font-family:var(--font-mono);">
              </div>
              <div style="margin-bottom:16px;">
                <label style="font-size:13px;display:block;margin-bottom:4px;">Account Alias</label>
                <input type="text" id="wiz-alias" placeholder="Production, Staging, etc." style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;">
              </div>
              <div id="wiz-err-1" style="display:none;padding:8px;border-radius:var(--r-sm);background:color-mix(in oklab, var(--s-crit) 12%, transparent);color:var(--s-crit);font-size:13px;margin-bottom:12px;"></div>
              <button class="btn btn--accent" id="wiz-next-1" style="width:100%;">Next — Generate Script</button>
            </div>
            <!-- Step 2: Run Script -->
            <div id="wiz-step-2" style="display:none;">
              <div class="t3 mb-8" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Step 2 of 4 — Run in Target Account CloudShell</div>
              <p class="t2" style="margin-bottom:12px;font-size:13px;">Copy this script and run it in the AWS CloudShell of the target account. It creates an IAM role that allows this platform to scan resources.</p>
              <div style="position:relative;">
                <pre id="wiz-script" style="background:var(--surface);padding:16px;border-radius:8px;font-size:11.5px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow-y:auto;border:1px solid var(--line);"></pre>
                <button class="btn btn--sm" id="wiz-copy" style="position:absolute;top:8px;right:8px;">Copy</button>
              </div>
              <button class="btn btn--accent mt-16" id="wiz-next-2" style="width:100%;">Next — Enter ARN</button>
            </div>
            <!-- Step 3: Enter ARN -->
            <div id="wiz-step-3" style="display:none;">
              <div class="t3 mb-8" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Step 3 of 4 — Enter Role ARN</div>
              <p class="t2" style="margin-bottom:12px;font-size:13px;">After running the script, paste the Role ARN output here:</p>
              <input type="text" id="wiz-arn" placeholder="arn:aws:iam::123456789012:role/WAReviewReadOnly" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:13px;font-family:var(--font-mono);">
              <div class="t3 mt-8" style="font-size:11px;color:var(--text-3);">Expected format: arn:aws:iam::&lt;account-id&gt;:role/WAReviewReadOnly</div>
              <div id="wiz-err-3" style="display:none;padding:8px;border-radius:var(--r-sm);background:color-mix(in oklab, var(--s-crit) 12%, transparent);color:var(--s-crit);font-size:13px;margin:12px 0;"></div>
              <button class="btn btn--accent mt-16" id="wiz-next-3" style="width:100%;">Next — Verify & Save</button>
            </div>
            <!-- Step 4: Verify & Save -->
            <div id="wiz-step-4" style="display:none;">
              <div class="t3 mb-8" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Step 4 of 4 — Verify & Save</div>
              <div id="wiz-verify-status" style="text-align:center;padding:24px;">
                <div class="t2">Verifying connectivity...</div>
                <div class="pillar__bar mt-16"><span style="width:50%;animation:pulse 1s infinite;"></span></div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // Close
      document.getElementById('wiz-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      // Step 1 → 2
      document.getElementById('wiz-next-1').addEventListener('click', () => {
        const acctId = document.getElementById('wiz-acct-id').value.trim();
        const alias = document.getElementById('wiz-alias').value.trim();
        const err = document.getElementById('wiz-err-1');
        if (!/^\d{12}$/.test(acctId)) { err.textContent = 'Account ID must be exactly 12 digits'; err.style.display = 'block'; return; }
        if (!alias) { err.textContent = 'Please enter an alias'; err.style.display = 'block'; return; }
        err.style.display = 'none';

        // Generate script
        const externalId = 'wa-review-' + acctId;
        const script = generateIAMScript(acctId, platformId, externalId);
        document.getElementById('wiz-script').textContent = script;
        document.getElementById('wiz-step-1').style.display = 'none';
        document.getElementById('wiz-step-2').style.display = 'block';

        // Pre-fill ARN
        document.getElementById('wiz-arn').value = 'arn:aws:iam::' + acctId + ':role/WAReviewReadOnly';
      });

      // Copy script
      document.getElementById('wiz-copy').addEventListener('click', () => {
        const text = document.getElementById('wiz-script').textContent;
        navigator.clipboard.writeText(text).then(() => {
          document.getElementById('wiz-copy').textContent = 'Copied';
          setTimeout(() => document.getElementById('wiz-copy').textContent = 'Copy', 2000);
        });
      });

      // Step 2 → 3
      document.getElementById('wiz-next-2').addEventListener('click', () => {
        document.getElementById('wiz-step-2').style.display = 'none';
        document.getElementById('wiz-step-3').style.display = 'block';
      });

      // Step 3 → 4 (verify & save)
      document.getElementById('wiz-next-3').addEventListener('click', async () => {
        const arn = document.getElementById('wiz-arn').value.trim();
        const err = document.getElementById('wiz-err-3');
        if (!/^arn:aws:iam::\d{12}:role\/.+$/.test(arn)) { err.textContent = 'Invalid ARN format'; err.style.display = 'block'; return; }
        err.style.display = 'none';

        document.getElementById('wiz-step-3').style.display = 'none';
        document.getElementById('wiz-step-4').style.display = 'block';

        const acctId = document.getElementById('wiz-acct-id').value.trim();
        const alias = document.getElementById('wiz-alias').value.trim();
        const statusEl = document.getElementById('wiz-verify-status');

        try {
          // Save account
          await ApiClient.post('/accounts', { accountId: acctId, roleArn: arn, alias: alias });
          statusEl.innerHTML = '<div class="t2">Account saved. Verifying connectivity...</div><div class="pillar__bar mt-16"><span style="width:70%;"></span></div>';

          // Verify connectivity
          try {
            const vr = await ApiClient.post('/accounts/' + acctId + '/verify', {});
            if (vr.connectionStatus === 'CONNECTED') {
              statusEl.innerHTML = '<div style="color:var(--s-low);font-size:18px;font-family:var(--font-display);">Connected</div><p class="t2 mt-8">Account ' + acctId + ' (' + alias + ') is ready for scanning.</p><button class="btn btn--accent mt-16" id="wiz-done" style="width:100%;">Done</button>';
            } else {
              statusEl.innerHTML = '<div style="color:var(--s-med);font-size:18px;font-family:var(--font-display);">Saved (verification failed)</div><p class="t2 mt-8">Account saved but connectivity test failed: ' + (vr.error || 'Unknown error') + '</p><p class="t2">Check that the IAM role was created correctly in the target account.</p><button class="btn btn--accent mt-16" id="wiz-done" style="width:100%;">Close</button>';
            }
          } catch (verr) {
            statusEl.innerHTML = '<div style="color:var(--s-med);font-size:18px;font-family:var(--font-display);">Saved (verification skipped)</div><p class="t2 mt-8">Account saved. Verification error: ' + verr.message + '</p><button class="btn btn--accent mt-16" id="wiz-done" style="width:100%;">Close</button>';
          }

          document.getElementById('wiz-done')?.addEventListener('click', () => {
            overlay.remove();
            DATA.loaded = false;
            render();
          });
        } catch (err) {
          statusEl.innerHTML = '<div style="color:var(--s-crit);font-size:18px;font-family:var(--font-display);">Error</div><p class="t2 mt-8">' + err.message + '</p><button class="btn btn--sm mt-16" id="wiz-back-3">Back</button>';
          document.getElementById('wiz-back-3')?.addEventListener('click', () => {
            document.getElementById('wiz-step-4').style.display = 'none';
            document.getElementById('wiz-step-3').style.display = 'block';
          });
        }
      });
    }

    function generateIAMScript(targetAcct, platformAcct, externalId) {
      return `#!/bin/bash
# Run this in the TARGET account (${targetAcct}) CloudShell
# Creates IAM role for WA Review Platform to scan resources

ROLE_NAME="WAReviewReadOnly"
PLATFORM_ACCOUNT="${platformAcct}"
EXTERNAL_ID="${externalId}"

# Create trust policy
cat > /tmp/trust-policy.json << 'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::${platformAcct}:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "${externalId}"
        }
      }
    }
  ]
}
POLICY

# Create the role
aws iam create-role \\
  --role-name $ROLE_NAME \\
  --assume-role-policy-document file:///tmp/trust-policy.json \\
  --description "Read-only role for WA Review Platform"

# Attach read-only policies
aws iam attach-role-policy --role-name $ROLE_NAME \\
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess

aws iam attach-role-policy --role-name $ROLE_NAME \\
  --policy-arn arn:aws:iam::aws:policy/AWSBillingReadOnlyAccess

echo ""
echo "Role ARN: arn:aws:iam::${targetAcct}:role/$ROLE_NAME"
echo "Copy the ARN above and paste it in the WA Review Platform."`;
    }

    if (btn1) btn1.addEventListener('click', showWizard);
    if (btn2) btn2.addEventListener('click', showWizard);

    // Verify buttons
    document.querySelectorAll('.btn-verify').forEach(b => {
      b.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        e.target.disabled = true;
        e.target.textContent = 'Verifying...';
        try {
          const res = await ApiClient.post('/accounts/' + id + '/verify', {});
          e.target.textContent = res.connectionStatus === 'CONNECTED' ? 'Connected' : 'Failed';
          e.target.style.color = res.connectionStatus === 'CONNECTED' ? 'var(--s-low)' : 'var(--s-crit)';
        } catch (err) {
          e.target.textContent = 'Error';
        }
        setTimeout(() => { e.target.disabled = false; e.target.textContent = 'Verify'; e.target.style.color = ''; }, 3000);
      });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete').forEach(b => {
      b.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (!confirm('Delete account ' + id + '?')) return;
        try {
          await ApiClient.del('/accounts/' + id);
          DATA.loaded = false;
          render();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    });
  }

  // ==================== TEAM WIRING ====================
  function wireTeam() {
    const btn = document.getElementById('btn-add-member');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.id = 'team-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `
        <div style="background:var(--surface-2);border-radius:var(--r-xl);padding:32px;width:100%;max-width:420px;box-shadow:var(--shadow-2);">
          <div class="flex between center mb-24">
            <h2 style="font-family:var(--font-display);font-size:22px;">Invite Team Member</h2>
            <button class="icon-btn" id="team-modal-close" style="font-size:18px;">x</button>
          </div>
          <div style="margin-bottom:16px;">
            <label style="font-size:13px;display:block;margin-bottom:4px;">Email</label>
            <input type="email" id="tm-email" placeholder="user@example.com" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;">
          </div>
          <div style="margin-bottom:16px;">
            <label style="font-size:13px;display:block;margin-bottom:4px;">Role</label>
            <select id="tm-role" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;">
              <option value="Viewer">Viewer</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div id="tm-error" style="display:none;padding:8px;border-radius:var(--r-sm);background:color-mix(in oklab, var(--s-crit) 12%, transparent);color:var(--s-crit);font-size:13px;margin-bottom:12px;"></div>
          <button class="btn btn--accent" id="tm-submit" style="width:100%;">Send Invitation</button>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById('team-modal-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      document.getElementById('tm-submit').addEventListener('click', async () => {
        const email = document.getElementById('tm-email').value.trim();
        const role = document.getElementById('tm-role').value;
        const err = document.getElementById('tm-error');
        if (!email) { err.textContent = 'Email is required'; err.style.display = 'block'; return; }
        err.style.display = 'none';
        const btn = document.getElementById('tm-submit');
        btn.disabled = true; btn.textContent = 'Sending...';
        try {
          await ApiClient.post('/team/members', { email, role });
          overlay.remove();
          DATA.loaded = false;
          render();
        } catch (e) {
          err.textContent = e.message; err.style.display = 'block';
          btn.disabled = false; btn.textContent = 'Send Invitation';
        }
      });
    });

    // Remove member buttons
    document.querySelectorAll('.btn-remove-member').forEach(b => {
      b.addEventListener('click', async (e) => {
        const email = e.target.dataset.email;
        if (!confirm('Remove ' + email + ' from the team?')) return;
        try {
          await ApiClient.del('/team/members/' + encodeURIComponent(email));
          DATA.loaded = false;
          render();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      });
    });
  }

  // ==================== REPORT PDF WIRING ====================
  function wireReport() {
    const btn = document.getElementById('btn-gen-pdf');
    const btn2 = document.getElementById('btn-gen-pdf2');
    const langSel = document.getElementById('rpt-lang');

    // Language switcher
    const T = {
      en: { confidential:'Confidential', title:'AWS Well-Architected Review Report', prepFor:'Prepared for', toc:'Table of Contents',
        s1:'Executive Summary', s2:'Pillar-by-Pillar Analysis', s3:'Priority Recommendations', s3desc:'Address Critical items first, then High severity.',
        s4:'All Findings with Remediation', s5:'Compliance Frameworks — Detail', s5desc:'Category-level compliance status for each framework.',
        s6:'Cost Overview', footer:'Generated by AWS WA Review Platform',
        resource:'Resource', severity:'Severity', titleCol:'Title', recommendation:'Recommendation', category:'Category', ruleId:'Rule ID', status:'Status', description:'Description',
        date:'Date', region:'Region', services:'Services', findings:'Findings', score:'Score', critical:'Critical', high:'High', medium:'Medium', low:'Low',
        scoreIs:'The overall score is', findingsFound:'findings were identified, including', critImmediate:'Immediate attention is required for Critical findings.', noCrit:'No Critical findings were detected.',
        compliant:'Compliant', needAttn:'Need Attention', notAvail:'N/A', passed:'passed', topIssues:'Top issues:', noTopIssues:'No critical or high findings.',
      },
      th: { confidential:'เอกสารลับ', title:'รายงานการตรวจสอบ AWS Well-Architected', prepFor:'จัดทำสำหรับ', toc:'สารบัญ',
        s1:'บทสรุปผู้บริหาร', s2:'การวิเคราะห์รายเสาหลัก', s3:'คำแนะนำเร่งด่วน', s3desc:'แก้ไขรายการ Critical ก่อน ตามด้วย High',
        s4:'ข้อค้นพบทั้งหมดพร้อมวิธีแก้ไข', s5:'Compliance Frameworks — รายละเอียด', s5desc:'สถานะการปฏิบัติตามมาตรฐานระดับ Category',
        s6:'ภาพรวมค่าใช้จ่าย', footer:'สร้างโดย AWS WA Review Platform',
        resource:'ทรัพยากร', severity:'ระดับ', titleCol:'หัวข้อ', recommendation:'คำแนะนำ/วิธีแก้ไข', category:'หมวดหมู่', ruleId:'Rule ID', status:'สถานะ', description:'รายละเอียด',
        date:'วันที่', region:'ภูมิภาค', services:'บริการ', findings:'ข้อค้นพบ', score:'คะแนน', critical:'วิกฤต', high:'สูง', medium:'ปานกลาง', low:'ต่ำ',
        scoreIs:'คะแนนรวม', findingsFound:'ข้อค้นพบ ประกอบด้วย', critImmediate:'ต้องดำเนินการแก้ไขข้อค้นพบระดับ Critical โดยเร่งด่วน', noCrit:'ไม่พบข้อค้นพบระดับ Critical',
        compliant:'ผ่าน', needAttn:'ต้องแก้ไข', notAvail:'ไม่มีข้อมูล', passed:'ผ่าน', topIssues:'ปัญหาสำคัญ:', noTopIssues:'ไม่พบปัญหาสำคัญ',
      }
    };

    if (langSel) {
      langSel.addEventListener('change', () => {
        const lang = langSel.value;
        const dict = T[lang] || T.en;
        const preview = document.getElementById('report-preview');
        if (!preview) return;
        preview.querySelectorAll('[data-t]').forEach(el => {
          const key = el.dataset.t;
          if (dict[key]) el.textContent = dict[key];
        });
        // Toggle date display
        preview.querySelectorAll('.rpt-date-en').forEach(el => el.style.display = lang === 'th' ? 'none' : '');
        preview.querySelectorAll('.rpt-date-th').forEach(el => el.style.display = lang === 'th' ? '' : 'none');
        // Update s1 description
        const s1 = preview.querySelector('.rpt-s1-desc');
        if (s1 && lang === 'th') s1.textContent = 'รายงานฉบับนี้นำเสนอผลการตรวจสอบ AWS Well-Architected Review แบบอัตโนมัติ ครอบคลุม ' + DATA.accounts.length + ' บัญชี AWS จำนวน ' + DATA.services.length + ' บริการ โดยประเมินทรัพยากรตามเสาหลัก 5 ด้านของ AWS Well-Architected Framework';
        else if (s1) s1.textContent = 'This report presents the results of an automated AWS Well-Architected Review conducted across ' + DATA.accounts.length + ' AWS account(s) covering ' + DATA.services.length + ' services. The review evaluated resources against the five pillars of the AWS Well-Architected Framework.';
      });
    }

    async function generatePDF(triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'Generating...';

      try {
        const preview = document.getElementById('report-preview');
        if (!preview) { alert('No report preview found'); return; }

        const clone = preview.cloneNode(true);
        clone.style.background = '#ffffff';
        clone.style.color = '#1a1a1a';
        clone.style.maxWidth = '800px';
        clone.style.borderRadius = '0';
        clone.style.boxShadow = 'none';

        // Replace CSS color-mix and var() with static colors for html2canvas compatibility
        const cssVarMap = {
          'var(--s-crit)':'#b53333','var(--s-high)':'#d97757','var(--s-med)':'#b8860b','var(--s-low)':'#2d7d46','var(--s-info)':'#5e5d59',
          'var(--ac-500)':'#c96442','var(--ac-600)':'#b5542f','var(--ac-100)':'#f7e1d6','var(--ac-400)':'#d97757',
          'var(--text)':'#141413','var(--text-2)':'#5e5d59','var(--text-3)':'#87867f',
          'var(--surface)':'#f5f4ed','var(--surface-2)':'#ffffff','var(--bg)':'#f0eee6',
          'var(--line)':'#e8e6dc','var(--line-2)':'#cfccbf',
          'var(--ink-100)':'#f0eee6','var(--ink-900)':'#141413',
        };
        const allEls = clone.querySelectorAll('*');
        allEls.forEach(el => {
          const s = el.getAttribute('style');
          if (!s) return;
          let fixed = s;
          // Replace color-mix with fallback
          fixed = fixed.replace(/color-mix\(in oklab,\s*var\(--s-crit\)\s*\d+%,\s*transparent\)/g, '#f5d5d5');
          fixed = fixed.replace(/color-mix\(in oklab,\s*var\(--s-high\)\s*\d+%,\s*transparent\)/g, '#fde8d8');
          fixed = fixed.replace(/color-mix\(in oklab,\s*var\(--s-med\)\s*\d+%,\s*transparent\)/g, '#f5ecd0');
          fixed = fixed.replace(/color-mix\(in oklab,\s*var\(--s-low\)\s*\d+%,\s*transparent\)/g, '#d5f0dd');
          fixed = fixed.replace(/color-mix\(in oklab,\s*var\(--s-info\)\s*\d+%,\s*transparent\)/g, '#ececec');
          fixed = fixed.replace(/color-mix\(in oklab,\s*var\(--ac-500\)\s*\d+%,\s*transparent\)/g, '#f7e1d6');
          fixed = fixed.replace(/color-mix\(in oklab,\s*var\(--ac-100\)\s*\d+%,\s*transparent\)/g, '#faf3ee');
          fixed = fixed.replace(/color-mix\(in oklab,[^)]*\)/g, '#f0eee6');
          // Replace var() references
          Object.entries(cssVarMap).forEach(([v, c]) => { fixed = fixed.split(v).join(c); });
          // Replace any remaining var()
          fixed = fixed.replace(/var\(--[^)]+\)/g, '#141413');
          if (fixed !== s) el.setAttribute('style', fixed);
        });

        // Also fix badge classes that use color-mix via CSS classes
        clone.querySelectorAll('.badge').forEach(b => {
          const cls = b.className;
          if (cls.includes('badge--crit')) { b.style.background = '#f5d5d5'; b.style.color = '#b53333'; }
          else if (cls.includes('badge--high')) { b.style.background = '#fde8d8'; b.style.color = '#8a3f20'; }
          else if (cls.includes('badge--med')) { b.style.background = '#f5ecd0'; b.style.color = '#8a6500'; }
          else if (cls.includes('badge--low')) { b.style.background = '#d5f0dd'; b.style.color = '#2d7d46'; }
          else if (cls.includes('badge--info')) { b.style.background = '#ececec'; b.style.color = '#5e5d59'; }
          else if (cls.includes('badge--outline')) { b.style.background = 'transparent'; b.style.border = '1px solid #cfccbf'; b.style.color = '#5e5d59'; }
        });
        clone.querySelectorAll('.pillar__bar > span').forEach(bar => {
          if (!bar.style.background || bar.style.background.includes('var(')) bar.style.background = '#c96442';
        });
        clone.querySelectorAll('.sq').forEach(sq => {
          const cls = sq.className;
          if (cls.includes('sq--crit')) sq.style.background = '#b53333';
          else if (cls.includes('sq--high')) sq.style.background = '#d97757';
          else if (cls.includes('sq--med')) sq.style.background = '#b8860b';
          else if (cls.includes('sq--low')) sq.style.background = '#2d7d46';
        });

        document.body.appendChild(clone);

        await html2pdf().set({
          margin: [8, 8, 8, 8],
          filename: 'AWS-WA-Review-Report-' + new Date().toISOString().slice(0,10) + '.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        }).from(clone).save();

        document.body.removeChild(clone);
      } catch (err) {
        alert('PDF generation error: ' + err.message);
      }

      triggerBtn.disabled = false;
      triggerBtn.textContent = 'Generate PDF';
    }

    if (btn) btn.addEventListener('click', () => generatePDF(btn));
    if (btn2) btn2.addEventListener('click', () => generatePDF(btn2));
  }

  // ==================== INVESTIGATE (CloudTrail) ====================
  function wireInvestigate() {
    const btn = document.getElementById('btn-investigate');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const acctId = document.getElementById('inv-acct').value;
      const region = document.getElementById('inv-region').value;
      const hours = parseInt(document.getElementById('inv-time').value);
      const username = document.getElementById('inv-user').value.trim();
      const eventName = document.getElementById('inv-event').value.trim();
      const maxResults = parseInt(document.getElementById('inv-max').value);

      if (!acctId) { alert('Please select an account'); return; }

      btn.disabled = true;
      btn.textContent = 'Searching...';
      const resultsEl = document.getElementById('inv-results');
      const summaryEl = document.getElementById('inv-summary');
      resultsEl.innerHTML = '<div style="padding:40px; text-align:center;"><div class="t2">Querying CloudTrail...</div></div>';

      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const body = { accountId: acctId, region, startTime, endTime, maxResults };
      if (username) body.username = username;
      if (eventName) body.eventName = eventName;

      try {
        const data = await ApiClient.post('/investigate', body);
        const events = data.events || [];
        const s = data.summary || {};

        // Summary cards
        summaryEl.style.display = 'block';
        summaryEl.innerHTML = '<div class="grid grid-4" style="gap:8px; grid-template-columns:repeat(6,1fr);">' +
          '<div style="padding:12px; background:var(--surface-2); border-radius:var(--r-sm); text-align:center; box-shadow:var(--shadow-1);"><div class="t3" style="font-size:10px;">Events</div><div style="font-family:var(--font-display); font-size:24px;">' + (s.totalEvents||0) + '</div></div>' +
          '<div style="padding:12px; background:var(--surface-2); border-radius:var(--r-sm); text-align:center; box-shadow:var(--shadow-1);"><div class="t3" style="font-size:10px;">Alerts</div><div style="font-family:var(--font-display); font-size:24px; color:var(--s-crit);">' + (s.alerts||0) + '</div></div>' +
          '<div style="padding:12px; background:var(--surface-2); border-radius:var(--r-sm); text-align:center; box-shadow:var(--shadow-1);"><div class="t3" style="font-size:10px;">Warnings</div><div style="font-family:var(--font-display); font-size:24px; color:var(--s-med);">' + (s.warnings||0) + '</div></div>' +
          '<div style="padding:12px; background:var(--surface-2); border-radius:var(--r-sm); text-align:center; box-shadow:var(--shadow-1);"><div class="t3" style="font-size:10px;">Errors</div><div style="font-family:var(--font-display); font-size:24px; color:var(--s-high);">' + (s.errors||0) + '</div></div>' +
          '<div style="padding:12px; background:var(--surface-2); border-radius:var(--r-sm); text-align:center; box-shadow:var(--shadow-1);"><div class="t3" style="font-size:10px;">Users</div><div style="font-family:var(--font-display); font-size:24px;">' + (s.uniqueUsers||0) + '</div></div>' +
          '<div style="padding:12px; background:var(--surface-2); border-radius:var(--r-sm); text-align:center; box-shadow:var(--shadow-1);"><div class="t3" style="font-size:10px;">IPs</div><div style="font-family:var(--font-display); font-size:24px;">' + (s.uniqueIPs||0) + '</div></div>' +
        '</div>';

        // Events table
        if (!events.length) {
          resultsEl.innerHTML = '<div style="padding:40px; text-align:center;"><p class="t2">No events found for this query.</p></div>';
        } else {
          const riskColor = r => r === 'alert' ? 'var(--s-crit)' : r === 'warning' ? 'var(--s-med)' : 'transparent';
          const riskBadge = r => r === 'alert' ? '<span class="badge badge--crit">ALERT</span>' : r === 'warning' ? '<span class="badge badge--med">WARNING</span>' : '';
          resultsEl.innerHTML = '<table class="tbl" style="font-size:12px;"><thead><tr><th>Time</th><th>Event</th><th>User</th><th>Source IP</th><th>Risk</th><th>Error</th></tr></thead><tbody>' +
            events.map(e => '<tr style="border-left:3px solid ' + riskColor(e.risk) + ';">' +
              '<td class="mono" style="font-size:11px; white-space:nowrap;">' + (e.eventTime||'').replace('T',' ').substring(0,19) + '</td>' +
              '<td><strong>' + e.eventName + '</strong><div class="t3" style="font-size:10px;">' + e.eventSource + '</div></td>' +
              '<td>' + e.username + '<div class="t3" style="font-size:10px;">' + e.userType + '</div></td>' +
              '<td class="mono" style="font-size:11px;">' + e.sourceIP + '</td>' +
              '<td>' + riskBadge(e.risk) + '</td>' +
              '<td style="color:var(--s-crit); font-size:11px;">' + (e.errorCode ? e.errorCode + (e.errorMessage ? '<div class="t3" style="font-size:10px;">' + e.errorMessage.substring(0,60) + '</div>' : '') : '') + '</td>' +
            '</tr>').join('') +
          '</tbody></table>';
        }
      } catch (err) {
        resultsEl.innerHTML = '<div style="padding:40px; text-align:center; color:var(--s-crit);"><p>Error: ' + err.message + '</p></div>';
        summaryEl.style.display = 'none';
      }

      btn.disabled = false;
      btn.textContent = 'Search Events';
    });
  }

  // ==================== COMPLIANCE FRAMEWORK TABS ====================
  function wireCompliance() {
    const cards = document.querySelectorAll('.fw-tab');
    if (!cards.length) return;
    let activeId = null;

    cards.forEach(card => {
      card.addEventListener('click', () => {
        const fwId = card.dataset.fw;

        // Toggle: click same card again to close
        if (activeId === fwId) {
          document.getElementById('fw-panel-' + fwId).style.display = 'none';
          card.style.outline = '2px solid transparent';
          activeId = null;
          return;
        }

        // Hide all panels, deselect all cards
        document.querySelectorAll('.fw-panel').forEach(p => p.style.display = 'none');
        cards.forEach(c => c.style.outline = '2px solid transparent');

        // Show selected
        const panel = document.getElementById('fw-panel-' + fwId);
        if (panel) {
          panel.style.display = 'block';
          card.style.outline = '2px solid var(--ac-500)';
          activeId = fwId;
          panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

          // Wire filter buttons inside this panel
          panel.querySelectorAll('.fw-filter').forEach(btn => {
            btn.addEventListener('click', () => {
              const filter = btn.dataset.filter;
              panel.querySelectorAll('.fw-filter').forEach(b => {
                b.classList.toggle('active', b === btn);
                b.classList.toggle('btn--ghost', b !== btn);
              });
              btn.classList.remove('btn--ghost');
              panel.querySelectorAll('.fw-tbody tr').forEach(tr => {
                if (filter === 'all') { tr.style.display = ''; }
                else { tr.style.display = tr.dataset.status === filter ? '' : 'none'; }
              });
            });
          });
        }
      });
    });
  }

  // ==================== FINOPS CALCULATORS ====================
  function wireFinOps() {
    // RI Calculator
    const riCalcBtn = document.getElementById('ri-calc');
    if (riCalcBtn) {
      riCalcBtn.addEventListener('click', () => {
        const od = parseFloat(document.getElementById('ri-od').value) || 0;
        const count = parseInt(document.getElementById('ri-count').value) || 1;
        const term = parseInt(document.getElementById('ri-term').value) || 1;
        const payment = document.getElementById('ri-payment').value;

        // Discount rates (approximate AWS RI discounts)
        const discounts = {
          '1-none': 0.30, '1-partial': 0.38, '1-all': 0.42,
          '3-none': 0.45, '3-partial': 0.55, '3-all': 0.60,
        };
        const key = term + '-' + payment;
        const discount = discounts[key] || 0.35;

        const monthlyOD = od * 730 * count;
        const monthlyRI = monthlyOD * (1 - discount);
        const monthlySave = monthlyOD - monthlyRI;
        const yearlySave = monthlySave * 12;
        const totalSave = yearlySave * term;

        const upfrontPct = payment === 'all' ? 1 : payment === 'partial' ? 0.5 : 0;
        const upfrontCost = monthlyRI * 12 * term * upfrontPct;
        const monthlyAfterUpfront = payment === 'all' ? 0 : monthlyRI * (1 - upfrontPct);

        document.getElementById('ri-result').innerHTML = `
          <div style="background:var(--surface-2); border-radius:var(--r-sm); padding:14px; margin-top:8px; border:1px solid var(--line);">
            <div class="flex between mb-8"><span class="t3">On-Demand cost</span><strong class="mono">$${monthlyOD.toFixed(0)}/mo</strong></div>
            <div class="flex between mb-8"><span class="t3">RI cost (${Math.round(discount*100)}% off)</span><strong class="mono">$${monthlyRI.toFixed(0)}/mo</strong></div>
            ${upfrontCost > 0 ? '<div class="flex between mb-8"><span class="t3">Upfront payment</span><strong class="mono">$' + upfrontCost.toFixed(0) + '</strong></div>' : ''}
            ${monthlyAfterUpfront > 0 ? '<div class="flex between mb-8"><span class="t3">Monthly after upfront</span><strong class="mono">$' + monthlyAfterUpfront.toFixed(0) + '/mo</strong></div>' : ''}
            <div style="border-top:1px solid var(--line); padding-top:8px; margin-top:4px;" class="flex between">
              <span style="color:var(--s-low); font-weight:600;">Monthly savings</span>
              <strong style="font-family:var(--font-display); font-size:22px; color:var(--s-low);">$${monthlySave.toFixed(0)}</strong>
            </div>
            <div class="flex between mt-8"><span class="t3">Total savings (${term}yr)</span><strong class="mono" style="color:var(--s-low)">$${totalSave.toFixed(0)}</strong></div>
          </div>
        `;
      });
    }

    // SP Calculator
    const spCalcBtn = document.getElementById('sp-calc');
    if (spCalcBtn) {
      spCalcBtn.addEventListener('click', () => {
        const commit = parseFloat(document.getElementById('sp-commit').value) || 0;
        const odMonthly = parseFloat(document.getElementById('sp-od').value) || 0;
        const term = parseInt(document.getElementById('sp-term').value) || 1;
        const payment = document.getElementById('sp-payment').value;
        const spType = document.getElementById('sp-type').value;

        // SP discount rates
        const discounts = {
          'compute-1-none': 0.17, 'compute-1-partial': 0.25, 'compute-1-all': 0.30,
          'compute-3-none': 0.36, 'compute-3-partial': 0.46, 'compute-3-all': 0.52,
          'ec2-1-none': 0.28, 'ec2-1-partial': 0.38, 'ec2-1-all': 0.42,
          'ec2-3-none': 0.45, 'ec2-3-partial': 0.55, 'ec2-3-all': 0.60,
          'sagemaker-1-none': 0.15, 'sagemaker-1-partial': 0.20, 'sagemaker-1-all': 0.25,
          'sagemaker-3-none': 0.30, 'sagemaker-3-partial': 0.40, 'sagemaker-3-all': 0.45,
        };
        const key = spType + '-' + term + '-' + payment;
        const discount = discounts[key] || 0.25;

        const commitMonthly = commit * 730;
        const coveredSpend = Math.min(odMonthly, commitMonthly / (1 - discount));
        const savingsOnCovered = coveredSpend * discount;
        const uncoveredSpend = Math.max(0, odMonthly - coveredSpend);
        const newMonthly = commitMonthly + uncoveredSpend;
        const monthlySave = odMonthly - newMonthly;

        const upfrontPct = payment === 'all' ? 1 : payment === 'partial' ? 0.5 : 0;
        const upfrontCost = commitMonthly * 12 * term * upfrontPct;
        const monthlyCommitAfter = payment === 'all' ? 0 : commitMonthly * (1 - upfrontPct);

        const typeLabel = spType === 'compute' ? 'Compute' : spType === 'ec2' ? 'EC2 Instance' : 'SageMaker';

        document.getElementById('sp-result').innerHTML = `
          <div style="background:var(--surface-2); border-radius:var(--r-sm); padding:14px; margin-top:8px; border:1px solid var(--line);">
            <div class="t3 mb-8" style="font-size:11px; letter-spacing:.06em; text-transform:uppercase">${typeLabel} Savings Plan · ${term} Year · ${discount*100}% discount</div>
            <div class="flex between mb-8"><span class="t3">Current On-Demand</span><strong class="mono">$${odMonthly.toFixed(0)}/mo</strong></div>
            <div class="flex between mb-8"><span class="t3">Hourly commitment</span><strong class="mono">$${commit.toFixed(3)}/hr ($${commitMonthly.toFixed(0)}/mo)</strong></div>
            ${upfrontCost > 0 ? '<div class="flex between mb-8"><span class="t3">Upfront payment</span><strong class="mono">$' + upfrontCost.toFixed(0) + '</strong></div>' : ''}
            <div class="flex between mb-8"><span class="t3">Covered spend</span><strong class="mono">$${coveredSpend.toFixed(0)}/mo</strong></div>
            ${uncoveredSpend > 0 ? '<div class="flex between mb-8"><span class="t3">Uncovered (On-Demand)</span><strong class="mono">$' + uncoveredSpend.toFixed(0) + '/mo</strong></div>' : ''}
            <div style="border-top:1px solid var(--line); padding-top:8px; margin-top:4px;" class="flex between">
              <span style="color:${monthlySave > 0 ? 'var(--s-low)' : 'var(--s-crit)'}; font-weight:600;">Monthly savings</span>
              <strong style="font-family:var(--font-display); font-size:22px; color:${monthlySave > 0 ? 'var(--s-low)' : 'var(--s-crit)'};">$${monthlySave.toFixed(0)}</strong>
            </div>
            <div class="flex between mt-8"><span class="t3">Total savings (${term}yr)</span><strong class="mono" style="color:${monthlySave > 0 ? 'var(--s-low)' : 'var(--s-crit)'}">$${(monthlySave * 12 * term).toFixed(0)}</strong></div>
            ${monthlySave <= 0 ? '<div class="t2 mt-8" style="font-size:12px; color:var(--s-med);">Commitment exceeds current spend — consider a lower hourly commitment.</div>' : ''}
          </div>
        `;
      });
    }
  }

  // ==================== AVATAR MENU (profile, reset pw, mobile, logout) ====================
  function wireAvatarMenu() {
    const wrap = document.getElementById('avatarWrap');
    const btn = document.getElementById('avatarBtn');
    if (!wrap || !btn) return;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#avatarWrap')) wrap.classList.remove('open');
    });

    // Logout
    document.getElementById('menu-logout')?.addEventListener('click', () => {
      wrap.classList.remove('open');
      if (typeof Auth !== 'undefined') Auth.logout();
    });

    // Reset Password
    document.getElementById('menu-reset-pw')?.addEventListener('click', () => {
      wrap.classList.remove('open');
      showProfileModal('reset-pw');
    });

    // Personal Information
    document.getElementById('menu-profile')?.addEventListener('click', () => {
      wrap.classList.remove('open');
      showProfileModal('profile');
    });

    // Add Mobile Number
    document.getElementById('menu-mobile')?.addEventListener('click', () => {
      wrap.classList.remove('open');
      showProfileModal('mobile');
    });
  }

  function showProfileModal(mode) {
    const existing = document.getElementById('profile-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'profile-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;';

    let title = '';
    let body = '';

    if (mode === 'reset-pw') {
      title = 'Reset Password';
      body = `
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;display:block;margin-bottom:4px;">Current Password</label>
          <input type="password" id="pm-old-pw" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;display:block;margin-bottom:4px;">New Password</label>
          <input type="password" id="pm-new-pw" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;display:block;margin-bottom:4px;">Confirm New Password</label>
          <input type="password" id="pm-confirm-pw" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;">
        </div>
        <div id="pm-error" style="display:none;padding:8px;border-radius:var(--r-sm);background:color-mix(in oklab, var(--s-crit) 12%, transparent);color:var(--s-crit);font-size:13px;margin-bottom:12px;"></div>
        <button class="btn btn--accent" id="pm-submit" style="width:100%;">Change Password</button>
      `;
    } else if (mode === 'mobile') {
      title = 'Add Mobile Number';
      body = `
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;display:block;margin-bottom:4px;">Mobile Number</label>
          <input type="tel" id="pm-mobile" placeholder="+66812345678" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;font-family:var(--font-mono);">
          <div class="t3" style="font-size:11px;margin-top:4px;">Include country code (e.g. +66)</div>
        </div>
        <div id="pm-error" style="display:none;padding:8px;border-radius:var(--r-sm);background:color-mix(in oklab, var(--s-crit) 12%, transparent);color:var(--s-crit);font-size:13px;margin-bottom:12px;"></div>
        <button class="btn btn--accent" id="pm-submit" style="width:100%;">Save Mobile Number</button>
      `;
    } else {
      title = 'Personal Information';
      body = `
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;display:block;margin-bottom:4px;">Email</label>
          <input type="email" id="pm-email" value="${state.user || ''}" disabled style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--line);color:var(--text-2);font-size:14px;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;display:block;margin-bottom:4px;">Display Name</label>
          <input type="text" id="pm-name" value="${state.user ? state.user.split('@')[0] : ''}" style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-size:14px;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;display:block;margin-bottom:4px;">Role</label>
          <input type="text" value="${state.role || 'Viewer'}" disabled style="width:100%;padding:8px 12px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--line);color:var(--text-2);font-size:14px;">
        </div>
        <div id="pm-error" style="display:none;padding:8px;border-radius:var(--r-sm);background:color-mix(in oklab, var(--s-crit) 12%, transparent);color:var(--s-crit);font-size:13px;margin-bottom:12px;"></div>
        <div id="pm-success" style="display:none;padding:8px;border-radius:var(--r-sm);background:color-mix(in oklab, var(--s-low) 12%, transparent);color:var(--s-low);font-size:13px;margin-bottom:12px;"></div>
        <button class="btn btn--accent" id="pm-submit" style="width:100%;">Save Changes</button>
      `;
    }

    overlay.innerHTML = `
      <div style="background:var(--surface-2);border-radius:var(--r-xl);padding:32px;width:100%;max-width:420px;box-shadow:var(--shadow-2);">
        <div class="flex between center mb-24">
          <h2 style="font-family:var(--font-display);font-size:22px;">${title}</h2>
          <button class="icon-btn" id="pm-close" style="font-size:18px;">x</button>
        </div>
        ${body}
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('pm-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Submit handler
    document.getElementById('pm-submit')?.addEventListener('click', async () => {
      const errEl = document.getElementById('pm-error');
      const sucEl = document.getElementById('pm-success');
      const submitBtn = document.getElementById('pm-submit');

      if (mode === 'reset-pw') {
        const oldPw = document.getElementById('pm-old-pw').value;
        const newPw = document.getElementById('pm-new-pw').value;
        const confirmPw = document.getElementById('pm-confirm-pw').value;
        if (!oldPw || !newPw) { errEl.textContent = 'All fields are required'; errEl.style.display = 'block'; return; }
        if (newPw !== confirmPw) { errEl.textContent = 'Passwords do not match'; errEl.style.display = 'block'; return; }
        if (newPw.length < 8) { errEl.textContent = 'Password must be at least 8 characters'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        submitBtn.disabled = true; submitBtn.textContent = 'Changing...';
        try {
          // Use Cognito changePassword
          if (typeof AmazonCognitoIdentity !== 'undefined') {
            const pool = new AmazonCognitoIdentity.CognitoUserPool({
              UserPoolId: window.WA_CONFIG.USER_POOL_ID,
              ClientId: window.WA_CONFIG.CLIENT_ID,
            });
            const user = pool.getCurrentUser();
            if (user) {
              user.getSession((err, session) => {
                if (err) { errEl.textContent = err.message; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Change Password'; return; }
                user.changePassword(oldPw, newPw, (err2, result) => {
                  if (err2) { errEl.textContent = err2.message || 'Failed to change password'; errEl.style.display = 'block'; }
                  else { overlay.innerHTML = '<div style="background:var(--surface-2);border-radius:var(--r-xl);padding:40px;text-align:center;"><div style="color:var(--s-low);font-size:18px;font-family:var(--font-display);margin-bottom:8px;">Password Changed</div><p class="t2">Your password has been updated successfully.</p><button class="btn btn--accent mt-16" onclick="this.closest(\'[id=profile-modal-overlay]\').remove()">Close</button></div>'; }
                  submitBtn.disabled = false; submitBtn.textContent = 'Change Password';
                });
              });
            }
          }
        } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Change Password'; }

      } else if (mode === 'mobile') {
        const mobile = document.getElementById('pm-mobile').value.trim();
        if (!mobile) { errEl.textContent = 'Please enter a mobile number'; errEl.style.display = 'block'; return; }
        if (!/^\+\d{8,15}$/.test(mobile)) { errEl.textContent = 'Invalid format. Use +<country code><number>'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        submitBtn.disabled = true; submitBtn.textContent = 'Saving...';
        try {
          if (typeof AmazonCognitoIdentity !== 'undefined') {
            const pool = new AmazonCognitoIdentity.CognitoUserPool({
              UserPoolId: window.WA_CONFIG.USER_POOL_ID,
              ClientId: window.WA_CONFIG.CLIENT_ID,
            });
            const user = pool.getCurrentUser();
            if (user) {
              user.getSession((err, session) => {
                if (err) { errEl.textContent = err.message; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Save Mobile Number'; return; }
                const attrs = [new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'phone_number', Value: mobile })];
                user.updateAttributes(attrs, (err2, result) => {
                  if (err2) { errEl.textContent = err2.message || 'Failed to update'; errEl.style.display = 'block'; }
                  else { overlay.innerHTML = '<div style="background:var(--surface-2);border-radius:var(--r-xl);padding:40px;text-align:center;"><div style="color:var(--s-low);font-size:18px;font-family:var(--font-display);margin-bottom:8px;">Mobile Number Saved</div><p class="t2">' + mobile + '</p><button class="btn btn--accent mt-16" onclick="this.closest(\'[id=profile-modal-overlay]\').remove()">Close</button></div>'; }
                  submitBtn.disabled = false; submitBtn.textContent = 'Save Mobile Number';
                });
              });
            }
          }
        } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Save Mobile Number'; }

      } else {
        // Profile — update display name
        const name = document.getElementById('pm-name').value.trim();
        if (!name) { errEl.textContent = 'Display name is required'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        submitBtn.disabled = true; submitBtn.textContent = 'Saving...';
        try {
          if (typeof AmazonCognitoIdentity !== 'undefined') {
            const pool = new AmazonCognitoIdentity.CognitoUserPool({
              UserPoolId: window.WA_CONFIG.USER_POOL_ID,
              ClientId: window.WA_CONFIG.CLIENT_ID,
            });
            const user = pool.getCurrentUser();
            if (user) {
              user.getSession((err, session) => {
                if (err) { errEl.textContent = err.message; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Save Changes'; return; }
                const attrs = [new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'name', Value: name })];
                user.updateAttributes(attrs, (err2, result) => {
                  if (err2) { errEl.textContent = err2.message || 'Failed to update'; errEl.style.display = 'block'; }
                  else if (sucEl) { sucEl.textContent = 'Profile updated successfully'; sucEl.style.display = 'block'; }
                  submitBtn.disabled = false; submitBtn.textContent = 'Save Changes';
                });
              });
            }
          }
        } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; submitBtn.disabled = false; submitBtn.textContent = 'Save Changes'; }
      }
    });
  }

  // ==================== NAV ====================
  function wireNav() {
    const closeTimers = new Map();

    document.querySelectorAll('.nav__item').forEach(item => {
      const btn = item.querySelector('.nav__btn');

      btn.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = item.classList.contains('open');
        document.querySelectorAll('.nav__item.open').forEach(n => n.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
      });

      item.addEventListener('mouseenter', () => {
        // Cancel any pending close for this item
        if (closeTimers.has(item)) { clearTimeout(closeTimers.get(item)); closeTimers.delete(item); }
        // Close others immediately
        document.querySelectorAll('.nav__item.open').forEach(n => {
          if (n !== item) { n.classList.remove('open'); if (closeTimers.has(n)) { clearTimeout(closeTimers.get(n)); closeTimers.delete(n); } }
        });
        item.classList.add('open');
      });

      item.addEventListener('mouseleave', () => {
        // Delay close so user can move mouse across the gap to the panel
        const timer = setTimeout(() => { item.classList.remove('open'); closeTimers.delete(item); }, 280);
        closeTimers.set(item, timer);
      });
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.nav__item')) document.querySelectorAll('.nav__item.open').forEach(n => n.classList.remove('open'));
    });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-route]');
      if (a) { e.preventDefault(); go(a.dataset.route); }
    });
  }

  // ==================== COMMAND PALETTE ====================
  function wirePalette() {
    const p = document.getElementById('palette');
    const list = document.getElementById('paletteList');
    const input = document.getElementById('paletteInput');

    const items = [
      ...Object.entries(routes).map(([k,r]) => ({ group:'Navigate', label:r.label, sub:groupLabel[r.group], route:k })),
      ...DATA.findings.slice(0,6).map(f => ({ group:'Findings', label:f.title, sub:f.id+' · '+f.severity, route:'findings' })),
      ...DATA.accounts.map(a => ({ group:'Accounts', label:a.alias, sub:a.id, route:'accounts' })),
    ];

    function paint(q='') {
      const qq = q.toLowerCase();
      const filtered = items.filter(i => !qq || i.label.toLowerCase().includes(qq) || (i.sub||'').toLowerCase().includes(qq));
      const groups = {};
      filtered.forEach(i => { (groups[i.group] ||= []).push(i); });
      list.innerHTML = Object.entries(groups).map(([g, arr]) => `
        <div class="palette__group-label">${g}</div>
        ${arr.map((i,idx) => `<a class="palette__item ${!q && g==='Navigate' && idx===0?'active':''}" data-route="${i.route}" data-close>
          <span>${i.label}</span><span class="mono">${i.sub||''}</span>
        </a>`).join('')}
      `).join('');
    }
    function open() { p.hidden = false; input.value=''; paint(); setTimeout(()=>input.focus(), 30); }
    function close() { p.hidden = true; }
    document.getElementById('cmdBtn').addEventListener('click', open);
    p.addEventListener('click', e => { if (e.target.dataset.close !== undefined || e.target.closest('[data-close]')) close(); });
    input.addEventListener('input', e => paint(e.target.value));
    window.addEventListener('keydown', e => {
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k') { e.preventDefault(); p.hidden ? open() : close(); }
      if (e.key === 'Escape' && !p.hidden) close();
    });
  }

  // ==================== THEME ====================
  function wireTheme() {
    document.getElementById('themeBtn').addEventListener('click', () => {
      const cur = document.body.dataset.theme;
      applyTweaks({ theme: cur === 'dark' ? 'light' : 'dark' });
    });
  }

  // ==================== TWEAKS ====================
  function applyTweaks(partial) {
    const t = Object.assign({}, window.__TWEAKS__, partial || {});
    window.__TWEAKS__ = t;
    document.body.dataset.theme = t.theme;
    document.body.dataset.density = t.density;
    document.body.dataset.accent = t.accent;
    document.body.dataset.navStyle = t.navStyle;
    document.body.dataset.display = t.display;
    document.body.dataset.subtabs = t.subtabs;
    document.querySelectorAll('.tweaks [data-tw]').forEach(sel => {
      const k = sel.dataset.tw; if (t[k] != null) sel.value = t[k];
    });
    if (partial) {
      try { window.parent.postMessage({ type:'__edit_mode_set_keys', edits: partial }, '*'); } catch(e){}
    }
  }

  function wireTweaks() {
    window.addEventListener('message', e => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode')   document.getElementById('tweaks').hidden = false;
      if (d.type === '__deactivate_edit_mode') document.getElementById('tweaks').hidden = true;
    });
    try { window.parent.postMessage({ type:'__edit_mode_available' }, '*'); } catch(e){}
    document.getElementById('tweaksClose').addEventListener('click', () => document.getElementById('tweaks').hidden = true);
    document.querySelectorAll('.tweaks [data-tw]').forEach(sel => {
      sel.addEventListener('change', e => applyTweaks({ [sel.dataset.tw]: sel.value }));
    });
  }

  // ==================== AI CHAT ====================
  function wireAIChat() {
    const fab = document.getElementById('ai-fab');
    const panel = document.getElementById('ai-chat');
    const closeBtn = document.getElementById('ai-close');
    const input = document.getElementById('ai-input');
    const sendBtn = document.getElementById('ai-send');
    const messagesEl = document.getElementById('ai-messages');
    if (!fab || !panel) return;

    let chatHistory = [];

    function toggleChat() {
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'flex';
      if (!visible && messagesEl && !messagesEl.children.length) {
        addMessage('ai', 'สวัสดีครับ ผม WA Agent ช่วยวิเคราะห์ security, compliance, cost และ investigate CloudTrail events ได้ครับ ถามได้เลย!');
      }
      if (!visible) setTimeout(() => input?.focus(), 100);
    }

    fab.addEventListener('click', toggleChat);
    closeBtn?.addEventListener('click', () => { panel.style.display = 'none'; });

    function addMessage(type, text) {
      if (!messagesEl) return;
      const div = document.createElement('div');
      div.className = 'ai-msg ai-msg--' + type;
      if (type === 'ai') {
        // Simple markdown-like formatting
        div.innerHTML = text
          .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
          .replace(/`([^`]+)`/g, '<code style="background:var(--surface-2);padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br>');
      } else {
        div.textContent = text;
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addActionCard(action) {
      if (!messagesEl) return;
      const div = document.createElement('div');
      div.className = 'ai-action';
      div.innerHTML = `
        <div class="flex between center mb-8">
          <strong style="font-size:13px;">Proposed Action</strong>
          <span class="ai-action__risk ai-action__risk--${action.risk || 'LOW'}">${action.risk || 'LOW'} Risk</span>
        </div>
        <div style="font-size:13px; margin-bottom:8px;">${action.description || action.action}</div>
        <div class="flex gap-8 wrap mb-8" style="font-size:11px;">
          <span class="chip mono">${action.accountId || ''}</span>
          <span class="chip mono">${action.resourceId || ''}</span>
          <span class="chip">${action.action || ''}</span>
          ${action.reversible !== false ? '<span class="chip" style="color:var(--s-low)">Reversible</span>' : '<span class="chip" style="color:var(--s-crit)">Not reversible</span>'}
        </div>
        <div class="flex gap-8">
          <button class="btn btn--accent btn--sm ai-approve" data-action='${JSON.stringify(action).replace(/'/g,"&#39;")}'>Approve & Execute</button>
          <button class="btn btn--sm btn--ghost ai-reject">Reject</button>
        </div>
      `;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      // Wire approve/reject
      div.querySelector('.ai-approve')?.addEventListener('click', async (e) => {
        const btn = e.target;
        const act = JSON.parse(btn.dataset.action);
        btn.disabled = true; btn.textContent = 'Executing...';
        try {
          const res = await ApiClient.post('/ai/execute', act);
          if (res.success) {
            addMessage('ai', 'Action executed successfully: ' + res.message);
          } else {
            addMessage('ai', 'Execution failed: ' + res.message);
          }
        } catch (err) {
          addMessage('ai', 'Error: ' + err.message);
        }
        div.remove();
      });
      div.querySelector('.ai-reject')?.addEventListener('click', () => {
        addMessage('system', 'Action rejected');
        div.remove();
      });
    }

    async function sendMessage() {
      const text = input?.value?.trim();
      if (!text) return;
      input.value = '';
      addMessage('user', text);

      const model = document.getElementById('ai-model')?.value || 'sonnet-4.6';
      const thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'ai-msg ai-msg--system';
      thinkingDiv.textContent = 'Thinking...';
      messagesEl?.appendChild(thinkingDiv);

      try {
        const res = await ApiClient.post('/ai/chat', { message: text, model, history: chatHistory });
        thinkingDiv.remove();

        if (res.response) {
          addMessage('ai', res.response);
          chatHistory.push({ role: 'user', content: text });
          chatHistory.push({ role: 'assistant', content: res.response });
          // Keep history manageable
          if (chatHistory.length > 20) chatHistory = chatHistory.slice(-16);
        }

        // Show pending actions
        if (res.pendingActions && res.pendingActions.length > 0) {
          res.pendingActions.forEach(action => addActionCard(action));
        }
      } catch (err) {
        thinkingDiv.remove();
        addMessage('ai', 'Error: ' + err.message);
      }
    }

    sendBtn?.addEventListener('click', sendMessage);
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
  }

  // ==================== BOOT ====================
  applyTweaks();
  wireNav();
  wirePalette();
  wireTheme();
  wireTweaks();

  // Auth integration
  App.state = state;
  App.setAuthenticated = function(user, role) {
    state.isAuthenticated = true;
    state.user = user;
    state.role = role || 'Viewer';
    DATA.loaded = false;
    render();
  };
  App.setUnauthenticated = function() {
    state.isAuthenticated = false;
    state.user = null;
    state.role = null;
    render();
  };
  App.renderPage = render;
  App.navigate = go;
  App.showModal = function() {};
  App.hideModal = function() {};

  // Check auth on load
  if (typeof Auth !== 'undefined' && Auth.checkSession) {
    Auth.checkSession();
  } else {
    render();
  }

  window.addEventListener('hashchange', render);
})();
