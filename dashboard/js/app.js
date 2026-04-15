/* ============================================
   WA Review Tool — Main App
   Hash-based routing, navigation, dark/light mode
   ============================================ */

const App = (() => {
  // --- Global State ---
  const state = {
    isAuthenticated: false,
    user: null,
    role: null, // 'Admin' | 'Viewer'
    currentPage: 'overview',
  };

  // --- Route Definitions ---
  const routes = {
    login:    { title: 'Login',    render: () => typeof LoginPage    !== 'undefined' ? LoginPage.render()    : placeholder('Login') },
    overview: { title: 'Overview', render: () => typeof OverviewPage !== 'undefined' ? OverviewPage.render() : placeholder('Overview') },
    findings: { title: 'Findings', render: () => typeof FindingsPage !== 'undefined' ? FindingsPage.render() : placeholder('Findings') },
    accounts: { title: 'Accounts', render: () => typeof AccountsPage !== 'undefined' ? AccountsPage.render() : placeholder('Accounts') },
    scan:     { title: 'Scan',     render: () => typeof ScanPage     !== 'undefined' ? ScanPage.render()     : placeholder('Scan') },
    history:  { title: 'History',  render: () => typeof HistoryPage  !== 'undefined' ? HistoryPage.render()  : placeholder('History') },
    report:   { title: 'Report',   render: () => typeof ReportPage   !== 'undefined' ? ReportPage.render()   : placeholder('Report') },
    cost:     { title: 'Cost Advisor', render: () => typeof CostPage !== 'undefined' ? CostPage.render() : placeholder('Cost Advisor') },
    team:     { title: 'Team',     render: () => typeof TeamPage     !== 'undefined' ? TeamPage.render()     : placeholder('Team Management') },
  };

  function placeholder(name) {
    return `<div class="page-header"><h2>${name}</h2><p>This page is under construction.</p></div>`;
  }

  // --- Routing ---
  function getHashRoute() {
    const hash = window.location.hash.replace('#', '') || 'overview';
    return routes[hash] ? hash : 'overview';
  }

  function navigate(page) {
    window.location.hash = page;
  }

  function renderPage() {
    const page = getHashRoute();

    // Auth guard: redirect to login if not authenticated (except login page)
    if (!state.isAuthenticated && page !== 'login') {
      navigate('login');
      return;
    }

    // If authenticated and on login page, redirect to overview
    if (state.isAuthenticated && page === 'login') {
      navigate('overview');
      return;
    }

    state.currentPage = page;
    const content = document.getElementById('content');
    const sidebar = document.getElementById('sidebar');
    const route = routes[page];

    // Hide sidebar on login page, show on other pages
    if (sidebar) {
      sidebar.style.display = page === 'login' ? 'none' : '';
    }
    if (content) {
      content.style.marginLeft = page === 'login' ? '0' : '';
      content.style.padding = page === 'login' ? '0' : '';
    }

    if (route) {
      content.innerHTML = route.render();
      document.title = `${route.title} — WA Review Tool`;

      // Call page init() to attach event listeners after render
      const pageModules = {
        login:    typeof LoginPage    !== 'undefined' ? LoginPage    : null,
        overview: typeof OverviewPage !== 'undefined' ? OverviewPage : null,
        findings: typeof FindingsPage !== 'undefined' ? FindingsPage : null,
        accounts: typeof AccountsPage !== 'undefined' ? AccountsPage : null,
        scan:     typeof ScanPage     !== 'undefined' ? ScanPage     : null,
        history:  typeof HistoryPage  !== 'undefined' ? HistoryPage  : null,
        report:   typeof ReportPage   !== 'undefined' ? ReportPage   : null,
        cost:     typeof CostPage     !== 'undefined' ? CostPage     : null,
        team:     typeof TeamPage     !== 'undefined' ? TeamPage     : null,
      };

      const pageModule = pageModules[page];
      if (pageModule && typeof pageModule.init === 'function') {
        pageModule.init();
      }
    }

    updateNavActive(page);
    updateRoleVisibility();
  }

  // --- Navigation ---
  function updateNavActive(page) {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });
  }

  function updateRoleVisibility() {
    const teamNav = document.getElementById('nav-team');
    if (teamNav) {
      teamNav.classList.toggle('hidden', state.role === 'Viewer');
    }
  }

  function updateUserInfo() {
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');
    if (emailEl) emailEl.textContent = state.user || '';
    if (roleEl) roleEl.textContent = state.role || '';
  }

  // --- Dark / Light Mode ---
  function initTheme() {
    const saved = localStorage.getItem('wa-theme') || 'light';
    document.body.setAttribute('data-theme', saved);
    updateThemeButton(saved);
  }

  function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('wa-theme', next);
    updateThemeButton(next);
  }

  function updateThemeButton(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
  }

  // --- Modal ---
  function showModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function hideModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
  }

  // --- Sidebar Toggle (mobile) ---
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('collapsed');
  }

  // --- Auth State Helpers ---
  function setAuthenticated(user, role) {
    state.isAuthenticated = true;
    state.user = user;
    state.role = role || 'Viewer';
    updateUserInfo();
    updateRoleVisibility();

    // Show sidebar elements
    document.getElementById('sidebar').style.display = '';
    renderPage();
  }

  function setUnauthenticated() {
    state.isAuthenticated = false;
    state.user = null;
    state.role = null;
    navigate('login');
  }

  // --- Init ---
  function init() {
    initTheme();

    // Event listeners
    window.addEventListener('hashchange', renderPage);

    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      if (typeof Auth !== 'undefined' && Auth.logout) {
        Auth.logout();
      }
      setUnauthenticated();
    });

    // Close modal on overlay click
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') hideModal();
    });

    // Nav link clicks
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        // Close sidebar on mobile after nav click
        if (window.innerWidth <= 768) {
          const sidebar = document.getElementById('sidebar');
          sidebar.classList.remove('open');
          sidebar.classList.add('collapsed');
        }
      });
    });

    // Check auth state on load
    if (typeof Auth !== 'undefined' && Auth.checkSession) {
      Auth.checkSession();
    } else {
      // No auth module loaded yet — show login
      renderPage();
    }
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // --- Public API ---
  return {
    state,
    navigate,
    renderPage,
    showModal,
    hideModal,
    setAuthenticated,
    setUnauthenticated,
    toggleTheme,
  };
})();
