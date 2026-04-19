/* ================ APP ================ */
(() => {
  const routes = {
    overview:  { group:'monitor', label:'Overview',    render: PAGES.overview,  subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['history','History']] },
    findings:  { group:'monitor', label:'Findings',    render: PAGES.findings,  subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['history','History']] },
    compliance:{ group:'monitor', label:'Compliance',  render: PAGES.compliance,subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['history','History']] },
    history:   { group:'monitor', label:'History',     render: PAGES.history,   subtabs:[['overview','Overview'],['findings','Findings'],['compliance','Compliance'],['history','History']] },
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
          <span class="iconchip"><span class="dot"></span> Live · ap-southeast-1</span>
        </div>
      </div>
    `;
  }

  function go(key) {
    location.hash = '#' + key;
  }

  function render() {
    const key = routeFromHash();
    const r = routes[key];
    document.getElementById('main').innerHTML = r.render();
    renderSubbar(key);
    // highlight nav group
    document.querySelectorAll('.nav__item').forEach(n => n.classList.toggle('active-group', n.dataset.group === r.group));
    // close any open menus
    document.querySelectorAll('.nav__item.open').forEach(n => n.classList.remove('open'));
    window.scrollTo({top:0, behavior:'instant'});
    // attach page-specific handlers
    wireFindings();
  }

  // Findings row click → drawer
  function wireFindings() {
    const tbody = document.getElementById('findings-tbody');
    if (!tbody) return;
    const drawer = document.getElementById('drawer');
    const body = document.getElementById('drawer-body');
    tbody.addEventListener('click', e => {
      const tr = e.target.closest('tr'); if (!tr) return;
      const f = DATA.findings.find(x => x.id === tr.dataset.id); if (!f) return;
      body.innerHTML = `
        <div class="t3" style="font-size:11px; letter-spacing:.1em; text-transform:uppercase">${f.service} · ${f.pillar}</div>
        <h2 style="font-family:var(--font-display); font-size:28px; letter-spacing:-.01em; margin:10px 0 12px; line-height:1.15">${f.title}</h2>
        <div class="flex wrap gap-8 mb-24">
          <span class="badge badge--${({CRITICAL:'crit',HIGH:'high',MEDIUM:'med',LOW:'low',INFORMATIONAL:'info'})[f.severity]}">${f.severity}</span>
          <span class="chip mono">${f.id}</span>
          <span class="chip">${f.account}</span>
          <span class="chip mono">${f.region}</span>
        </div>
        <div class="t3" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px">Resource</div>
        <div class="mono" style="background:var(--surface); padding:12px; border-radius:8px; font-size:12.5px; margin-bottom:20px; word-break:break-all">${f.resource}</div>
        <div class="t3" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px">Recommendation</div>
        <p class="t2" style="margin-bottom:20px">ปรับตั้งค่า resource นี้ให้สอดคล้องกับแนวปฏิบัติของ AWS Well-Architected Framework ใน pillar <strong>${f.pillar}</strong> · อ้างอิงเอกสาร best-practice และใช้ Infrastructure-as-Code เพื่อป้องกันการเกิดซ้ำ</p>
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

  // Nav menu open/close
  function wireNav() {
    document.querySelectorAll('.nav__item').forEach(item => {
      const btn = item.querySelector('.nav__btn');
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = item.classList.contains('open');
        document.querySelectorAll('.nav__item.open').forEach(n => n.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
      });
      item.addEventListener('mouseenter', () => {
        document.querySelectorAll('.nav__item.open').forEach(n => { if (n!==item) n.classList.remove('open'); });
        item.classList.add('open');
      });
      item.addEventListener('mouseleave', () => item.classList.remove('open'));
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.nav__item')) document.querySelectorAll('.nav__item.open').forEach(n => n.classList.remove('open'));
    });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-route]');
      if (a) {
        e.preventDefault();
        go(a.dataset.route);
      }
    });
  }

  // Command palette
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

  // Theme button
  function wireTheme() {
    document.getElementById('themeBtn').addEventListener('click', () => {
      const cur = document.body.dataset.theme;
      const next = cur === 'dark' ? 'light' : 'dark';
      applyTweaks({ theme: next });
    });
  }

  // ---------- Tweaks ----------
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
    // Edit mode protocol
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

  // Boot
  applyTweaks();
  wireNav();
  wirePalette();
  wireTheme();
  wireTweaks();
  render();
  window.addEventListener('hashchange', render);
})();
