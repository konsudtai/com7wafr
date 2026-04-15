/* ============================================
   WA Review Tool — Login Page
   Login form, force change password,
   MFA setup (QR code), MFA verification
   ============================================ */

const LoginPage = (() => {

  function render() {
    const demoHint = (typeof Auth !== 'undefined' && Auth.isDemoMode && Auth.isDemoMode())
      ? `<div class="alert alert-success" style="text-align:left; margin-top:16px; font-size:0.82rem;">
           <strong>Demo Mode</strong> — ใช้ user ตัวอย่างเพื่อทดสอบ:<br>
           Admin: <code>admin@demo.com</code> / <code>Admin123!</code><br>
           Viewer: <code>viewer@demo.com</code> / <code>Viewer123!</code>
         </div>`
      : '';

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
                <input type="password" id="login-password" placeholder="รหัสผ่าน" required autocomplete="current-password">
              </div>
              <div id="login-error" class="alert alert-error hidden" role="alert"></div>
              <button type="submit" id="login-submit" class="btn btn-primary btn-block">เข้าสู่ระบบ</button>
            </form>
            ${demoHint}
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

          <!-- Step 3: MFA Setup (first time — scan QR code) -->
          <div id="mfa-setup-container" class="hidden">
            <p style="font-weight:500; margin-bottom:8px;">ตั้งค่า Multi-Factor Authentication (MFA)</p>
            <p class="text-secondary mb-16" style="font-size:0.88rem;">
              สแกน QR code ด้านล่างด้วย authenticator app (Google Authenticator, Authy, Microsoft Authenticator) แล้วกรอกรหัส 6 หลัก
            </p>
            <div id="mfa-qr-container" style="text-align:center; margin-bottom:16px;">
              <canvas id="mfa-qr-code" style="margin:0 auto;"></canvas>
              <p id="mfa-secret-display" class="text-secondary mt-8" style="font-size:0.75rem; word-break:break-all;"></p>
              <button id="btn-copy-secret" class="btn btn-secondary btn-sm mt-8">Copy Secret Key</button>
            </div>
            <form id="mfa-setup-form">
              <div class="form-group">
                <label for="mfa-setup-code">รหัส MFA (6 หลัก)</label>
                <input type="text" id="mfa-setup-code" placeholder="123456" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" autocomplete="one-time-code" style="text-align:center; font-size:1.2rem; letter-spacing:8px;">
              </div>
              <div id="mfa-setup-error" class="alert alert-error hidden" role="alert"></div>
              <button type="submit" id="mfa-setup-submit" class="btn btn-primary btn-block">ยืนยันและเปิดใช้ MFA</button>
            </form>
          </div>

          <!-- Step 4: MFA Verify (returning user — enter TOTP code) -->
          <div id="mfa-verify-container" class="hidden">
            <p style="font-weight:500; margin-bottom:8px;">Multi-Factor Authentication</p>
            <p class="text-secondary mb-16" style="font-size:0.88rem;">กรอกรหัส 6 หลักจาก authenticator app ของคุณ</p>
            <form id="mfa-verify-form">
              <div class="form-group">
                <label for="mfa-verify-code">รหัส MFA</label>
                <input type="text" id="mfa-verify-code" placeholder="123456" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" autocomplete="one-time-code" style="text-align:center; font-size:1.2rem; letter-spacing:8px;">
              </div>
              <div id="mfa-verify-error" class="alert alert-error hidden" role="alert"></div>
              <button type="submit" id="mfa-verify-submit" class="btn btn-primary btn-block">ยืนยัน</button>
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
    ['login-form-container', 'change-password-container', 'mfa-setup-container', 'mfa-verify-container'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  function showSection(id) {
    hideAll();
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  // --- Generate QR code as text URI (for authenticator apps) ---
  function generateQrCodeUri(secret, email) {
    const issuer = encodeURIComponent('WAReview-Com7');
    const account = encodeURIComponent(email || 'user');
    return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`;
  }

  function renderQrCode(secret, email) {
    const uri = generateQrCodeUri(secret, email);
    const container = document.getElementById('mfa-qr-container');
    if (!container) return;

    // SECURITY FIX: Client-side only — no external API calls for QR code generation.
    // Show the secret key and otpauth URI for manual entry into authenticator apps.
    container.innerHTML = `
      <div style="background:var(--bg-page); border:1px solid var(--border-default); border-radius:8px; padding:16px; text-align:left;">
        <p style="font-weight:500; margin-bottom:8px; font-size:0.88rem;">Secret Key (กรอกใน authenticator app):</p>
        <code id="mfa-secret-text" style="font-size:1.1rem; font-weight:600; letter-spacing:2px; word-break:break-all; display:block; padding:8px; background:var(--bg-card); border-radius:4px; text-align:center;">${secret}</code>
        <button id="btn-copy-secret" class="btn btn-secondary btn-sm mt-8" style="width:100%;">Copy Secret Key</button>

        <hr style="margin:12px 0; border:none; border-top:1px solid var(--border-default);">

        <p style="font-weight:500; margin-bottom:4px; font-size:0.82rem;">otpauth:// URI (สำหรับ import อัตโนมัติ):</p>
        <code id="mfa-uri-text" style="font-size:0.72rem; word-break:break-all; display:block; padding:8px; background:var(--bg-card); border-radius:4px; color:var(--text-secondary);">${uri}</code>
        <button id="btn-copy-uri" class="btn btn-secondary btn-sm mt-8" style="width:100%;">Copy URI</button>

        <p class="text-secondary mt-8" style="font-size:0.78rem;">
          วิธีใช้: เปิด Google Authenticator, Authy หรือ Microsoft Authenticator แล้วเลือก "Enter setup key" จากนั้นกรอก Secret Key ด้านบน
        </p>
      </div>
    `;

    document.getElementById('btn-copy-secret')?.addEventListener('click', () => {
      navigator.clipboard.writeText(secret).then(() => {
        const btn = document.getElementById('btn-copy-secret');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Secret Key'; }, 2000); }
      });
    });

    document.getElementById('btn-copy-uri')?.addEventListener('click', () => {
      navigator.clipboard.writeText(uri).then(() => {
        const btn = document.getElementById('btn-copy-uri');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy URI'; }, 2000); }
      });
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
      } else if (result.mfaSetupRequired) {
        showSection('mfa-setup-container');
        renderQrCode(result.secretCode, email);
      } else if (result.mfaVerifyRequired) {
        showSection('mfa-verify-container');
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

  async function handleMfaSetup(e) {
    e.preventDefault();
    hideError('mfa-setup-error');
    const code = document.getElementById('mfa-setup-code').value.trim();
    if (!code || code.length !== 6) { showError('mfa-setup-error', 'กรุณากรอกรหัส 6 หลัก'); return; }

    setLoading('mfa-setup-submit', true, 'ยืนยันและเปิดใช้ MFA', 'กำลังยืนยัน...');
    try {
      await Auth.completeMfaSetup(code);
    } catch (err) {
      showError('mfa-setup-error', err.message || 'รหัส MFA ไม่ถูกต้อง');
    } finally {
      setLoading('mfa-setup-submit', false, 'ยืนยันและเปิดใช้ MFA', 'กำลังยืนยัน...');
    }
  }

  async function handleMfaVerify(e) {
    e.preventDefault();
    hideError('mfa-verify-error');
    const code = document.getElementById('mfa-verify-code').value.trim();
    if (!code || code.length !== 6) { showError('mfa-verify-error', 'กรุณากรอกรหัส 6 หลัก'); return; }

    setLoading('mfa-verify-submit', true, 'ยืนยัน', 'กำลังยืนยัน...');
    try {
      await Auth.verifyMfaCode(code);
    } catch (err) {
      showError('mfa-verify-error', err.message || 'รหัส MFA ไม่ถูกต้อง');
    } finally {
      setLoading('mfa-verify-submit', false, 'ยืนยัน', 'กำลังยืนยัน...');
    }
  }

  // --- Init ---
  function init() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);
    document.getElementById('mfa-setup-form')?.addEventListener('submit', handleMfaSetup);
    document.getElementById('mfa-verify-form')?.addEventListener('submit', handleMfaVerify);
  }

  return { render, init };
})();
