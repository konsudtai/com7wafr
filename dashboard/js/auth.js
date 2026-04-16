/* ============================================
   WA Review Tool — Auth Module
   Cognito integration: login, logout, token management,
   auto-refresh, force change password
   ============================================ */

const Auth = (() => {
  // --- Config ---
  const config = {
    UserPoolId: (window.WA_CONFIG && window.WA_CONFIG.USER_POOL_ID) || 'us-east-1_PLACEHOLDER',
    ClientId: (window.WA_CONFIG && window.WA_CONFIG.CLIENT_ID) || 'PLACEHOLDER_CLIENT_ID',
  };

  // --- State ---
  let userPool = null;
  let cognitoUser = null;
  let currentSession = null;
  let refreshTimer = null;
  let newPasswordRequired = false;
  let newPasswordUserAttributes = null;

  const GENERIC_ERROR = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';

  // --- Init Cognito ---
  function initPool() {
    if (!userPool && typeof AmazonCognitoIdentity !== 'undefined') {
      userPool = new AmazonCognitoIdentity.CognitoUserPool({
        UserPoolId: config.UserPoolId,
        ClientId: config.ClientId,
      });
    }
    return userPool;
  }

  // --- Extract role from ID token payload ---
  function extractRole(idToken) {
    try {
      const payload = idToken.decodePayload();
      return payload['custom:role'] || 'Viewer';
    } catch (e) {
      return 'Viewer';
    }
  }

  // --- Extract email from ID token payload ---
  function extractEmail(idToken) {
    try {
      const payload = idToken.decodePayload();
      return payload.email || '';
    } catch (e) {
      return '';
    }
  }

  // --- Schedule token auto-refresh ---
  function scheduleRefresh(session) {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    try {
      const idToken = session.getIdToken();
      const expiration = idToken.getExpiration(); // seconds since epoch
      const now = Math.floor(Date.now() / 1000);
      const refreshIn = (expiration - now - 300) * 1000; // 5 min before expiry, in ms

      if (refreshIn > 0) {
        refreshTimer = setTimeout(() => {
          refreshSession();
        }, refreshIn);
      } else {
        // Token already near expiry, refresh now
        refreshSession();
      }
    } catch (e) {
      // Ignore scheduling errors
    }
  }

  // --- Refresh session using refresh token ---
  function refreshSession() {
    const pool = initPool();
    if (!pool) return;

    const user = pool.getCurrentUser();
    if (!user) {
      if (typeof App !== 'undefined') App.setUnauthenticated();
      return;
    }

    user.getSession((err, session) => {
      if (err || !session || !session.isValid()) {
        if (typeof App !== 'undefined') App.setUnauthenticated();
        return;
      }

      currentSession = session;
      cognitoUser = user;
      scheduleRefresh(session);
    });
  }

  // --- Demo Mode ---
  // Demo users for testing without Cognito deployment
  const DEMO_USERS = {
    'admin@demo.com':  { password: 'Admin123!', role: 'Admin' },
    'viewer@demo.com': { password: 'Viewer123!', role: 'Viewer' },
  };

  function isDemoMode() {
    return config.UserPoolId.includes('PLACEHOLDER') || config.ClientId.includes('PLACEHOLDER');
  }

  function demoLogin(email, password) {
    return new Promise((resolve, reject) => {
      const user = DEMO_USERS[email];
      if (!user || user.password !== password) {
        reject(new Error(GENERIC_ERROR));
        return;
      }
      if (typeof App !== 'undefined') {
        App.setAuthenticated(email, user.role);
      }
      resolve({ success: true });
    });
  }

  // --- Login ---
  function login(email, password) {
    // Use demo mode when Cognito is not configured
    if (isDemoMode()) {
      return demoLogin(email, password);
    }

    return new Promise((resolve, reject) => {
      const pool = initPool();
      if (!pool) {
        reject(new Error(GENERIC_ERROR));
        return;
      }

      const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
        Username: email,
        Password: password,
      });

      cognitoUser = new AmazonCognitoIdentity.CognitoUser({
        Username: email,
        Pool: pool,
      });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
          handleAuthSuccess(session);
          resolve({ success: true });
        },

        onFailure: (err) => {
          reject(new Error(GENERIC_ERROR));
        },

        newPasswordRequired: (userAttributes, requiredAttributes) => {
          newPasswordRequired = true;
          delete userAttributes.email_verified;
          delete userAttributes.email;
          newPasswordUserAttributes = userAttributes;
          resolve({ success: false, newPasswordRequired: true });
        },
      });
    });
  }

  function handleAuthSuccess(session) {
    currentSession = session;
    newPasswordRequired = false;

    const idToken = session.getIdToken();
    const role = extractRole(idToken);
    const userEmail = extractEmail(idToken);

    scheduleRefresh(session);

    if (typeof App !== 'undefined') {
      App.setAuthenticated(userEmail, role);
    }
  }

  // --- Complete new password challenge ---
  function completeNewPassword(newPassword) {
    return new Promise((resolve, reject) => {
      if (!cognitoUser || !newPasswordRequired) {
        reject(new Error('ไม่มีคำขอเปลี่ยนรหัสผ่าน'));
        return;
      }

      cognitoUser.completeNewPasswordChallenge(newPassword, newPasswordUserAttributes || {}, {
        onSuccess: (session) => {
          currentSession = session;
          newPasswordRequired = false;
          newPasswordUserAttributes = null;

          const idToken = session.getIdToken();
          const role = extractRole(idToken);
          const userEmail = extractEmail(idToken);

          scheduleRefresh(session);

          if (typeof App !== 'undefined') {
            App.setAuthenticated(userEmail, role);
          }

          resolve({ success: true });
        },

        onFailure: (err) => {
          reject(new Error(err.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'));
        },
      });
    });
  }

  // --- Logout ---
  function logout() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    if (cognitoUser) {
      cognitoUser.signOut();
    }

    cognitoUser = null;
    currentSession = null;
    newPasswordRequired = false;
    newPasswordUserAttributes = null;

    if (typeof App !== 'undefined') {
      App.setUnauthenticated();
    }
  }

  // --- Check existing session on page load ---
  function checkSession() {
    // In demo mode, just render the page (no persistent session)
    if (isDemoMode()) {
      if (typeof App !== 'undefined') App.renderPage();
      return;
    }

    const pool = initPool();
    if (!pool) {
      if (typeof App !== 'undefined') App.renderPage();
      return;
    }

    const user = pool.getCurrentUser();
    if (!user) {
      if (typeof App !== 'undefined') App.renderPage();
      return;
    }

    user.getSession((err, session) => {
      if (err || !session || !session.isValid()) {
        if (typeof App !== 'undefined') App.renderPage();
        return;
      }

      cognitoUser = user;
      currentSession = session;

      const idToken = session.getIdToken();
      const role = extractRole(idToken);
      const userEmail = extractEmail(idToken);

      scheduleRefresh(session);

      if (typeof App !== 'undefined') {
        App.setAuthenticated(userEmail, role);
      }
    });
  }

  // --- Get current ID token JWT string ---
  function getIdToken() {
    if (currentSession && currentSession.isValid()) {
      return currentSession.getIdToken().getJwtToken();
    }
    return null;
  }

  // --- Check if new password is required ---
  function isNewPasswordRequired() {
    return newPasswordRequired;
  }

  // --- Public API ---
  return {
    login,
    completeNewPassword,
    logout,
    checkSession,
    getIdToken,
    isNewPasswordRequired,
    isDemoMode,
    GENERIC_ERROR,
  };
})();
