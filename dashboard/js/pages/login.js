/* ============================================
   WA Review Tool — Login Page
   Login form, force change password
   ============================================ */

const LoginPage = (() => {

  function render() {
    return `
      <div class="login-container">
        <div class="login-card">
          <img src="img/com7-logo.avif" alt="Com7 Business" style="height:36px; margin-bottom:16px;">
          <h1>WA Review</h1>
          <p>AWS Well-Architected Review Tool</p>

          <!-- Step 1: Login Form -->
          <div id="login-form-container">
            <form id="login-form" autocomplete="on">
              <div class="form-group">
                <label for="login-email">อีเมล</label>
                <input type="email" id="login-email" placeholder="email@example.com" required autocomplete="username">
              </div>
              <div class="form-group">
                <label for="login-password">รหัสผ่าน</label>
                <div style="position:relative;">
                  <input type="password" id="login-password" placeholder="รหัสผ่าน" required autocomplete="current-password" style="padding-right:44px;">
                  <button type="button" id="toggle-login-password" aria-label="แสดงรหัสผ่าน" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; padding:4px; color:var(--text-secondary); font-size:0.85rem;">แสดง</button>
                </div>
              </div>
              <div id="login-error" class="alert alert-error hidden" role="alert"></div>
              <button type="submit" id="login-submit" class="btn btn-primary btn-block">เข้าสู่ระบบ</button>
            </form>
          </div>

          <!-- Step 2: Change Password (first login) -->
          <div id="change-password-container" class="hidden">
            <p class="text-secondary mb-16">กรุณาตั้งรหัสผ่านใหม่สำหรับการเข้าใช้งานครั้งแรก</p>
            <form id="change-password-form" autocomplete="on">
              <div class="form-group">
                <label for="new-password">รหัสผ่านใหม่</label>
                <input type="password" id="new-password" placeholder="รหัสผ่านใหม่" required autocomplete="new-password" minlength="8">
              </div>
              <div class="form-group">
                <label for="confirm-password">ยืนยันรหัสผ่านใหม่</label>
                <input type="password" id="confirm-password" placeholder="ยืนยันรหัสผ่านใหม่" required autocomplete="new-password" minlength="8">
              </div>
              <div id="change-password-error" class="alert alert-error hidden" role="alert"></div>
              <button type="submit" id="change-password-submit" class="btn btn-primary btn-block">เปลี่ยนรหัสผ่าน</button>
            </form>
          </div>

        </div>
      </div>
    `;
  }

  // --- Helpers ---
  function showError(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.remove('hidden'); } }
  function hideError(id) { const el = document.getElementById(id); if (el) { el.classList.add('hidden'); el.textContent = ''; } }
  function setLoading(id, loading, defaultText, loadingText) {
    const btn = document.getElementById(id);
    if (btn) { btn.disabled = loading; btn.textContent = loading ? loadingText : defaultText; }
  }

  function hideAll() {
    ['login-form-container', 'change-password-container'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  function showSection(id) {
    hideAll();
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  // --- Toggle password visibility ---
  function initPasswordToggle(toggleId, inputId) {
    const btn = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? 'ซ่อน' : 'แสดง';
      btn.setAttribute('aria-label', isPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    });
  }

  // --- Handlers ---
  async function handleLogin(e) {
    e.preventDefault();
    hideError('login-error');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { showError('login-error', 'กรุณากรอกอีเมลและรหัสผ่าน'); return; }

    setLoading('login-submit', true, 'เข้าสู่ระบบ', 'กำลังเข้าสู่ระบบ...');
    try {
      const result = await Auth.login(email, password);
      if (result.newPasswordRequired) {
        showSection('change-password-container');
      }
    } catch (err) {
      showError('login-error', err.message || Auth.GENERIC_ERROR);
    } finally {
      setLoading('login-submit', false, 'เข้าสู่ระบบ', 'กำลังเข้าสู่ระบบ...');
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    hideError('change-password-error');
    const pw = document.getElementById('new-password').value;
    const cpw = document.getElementById('confirm-password').value;
    if (!pw || !cpw) { showError('change-password-error', 'กรุณากรอกรหัสผ่านใหม่'); return; }
    if (pw !== cpw) { showError('change-password-error', 'รหัสผ่านไม่ตรงกัน'); return; }
    if (pw.length < 8) { showError('change-password-error', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }

    setLoading('change-password-submit', true, 'เปลี่ยนรหัสผ่าน', 'กำลังเปลี่ยนรหัสผ่าน...');
    try {
      await Auth.completeNewPassword(pw);
    } catch (err) {
      showError('change-password-error', err.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
    } finally {
      setLoading('change-password-submit', false, 'เปลี่ยนรหัสผ่าน', 'กำลังเปลี่ยนรหัสผ่าน...');
    }
  }

  // --- Init ---
  function init() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);
    initPasswordToggle('toggle-login-password', 'login-password');
  }

  return { render, init };
})();
