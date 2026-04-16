/* ============================================
   WA Review Tool — Team Management Page
   Members table, Add/Remove/Change Role modals,
   self-deletion prevention, last admin protection
   ============================================ */

const TeamPage = (() => {
  let members = [];

  function roleBadgeClass(role) { return role === 'Admin' ? 'badge-high' : 'badge-info'; }
  function statusBadgeClass(status) { return status === 'Active' ? 'badge-low' : 'badge-medium'; }
  function getAdminCount() { return members.filter(m => m.role === 'Admin').length; }

  function render() {
    if (App.state.role !== 'Admin') {
      return `
        <div class="page-header"><h2>Team Management</h2></div>
        <div class="alert alert-warning">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ เฉพาะ Admin เท่านั้นที่สามารถจัดการทีมได้</div>
      `;
    }

    return `
      <div class="page-header flex-between">
        <div><h2>Team Management</h2><p>จัดการสมาชิกในทีมและกำหนดสิทธิ์การเข้าถึง</p></div>
        <button id="btn-add-member" class="btn btn-primary">+ Add Member</button>
      </div>

      <div id="team-loading" class="card" style="text-align:center; padding:48px;">
        <p class="text-secondary">กำลังโหลดข้อมูล...</p>
      </div>

      <div id="team-empty" class="card hidden" style="text-align:center; padding:48px;">
        <p class="text-secondary">ยังไม่มีสมาชิกในทีม</p>
      </div>

      <div id="team-content" class="card hidden">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Join Date</th><th>Actions</th></tr></thead>
            <tbody id="team-tbody"></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRow(member) {
    return `<tr>
      <td>${member.email}</td>
      <td><span class="badge ${roleBadgeClass(member.role)}">${member.role}</span></td>
      <td><span class="badge ${statusBadgeClass(member.status)}">${member.status || 'Active'}</span></td>
      <td>${member.joinDate || member.joined_at || '—'}</td>
      <td><div class="flex gap-8">
        <button class="btn btn-secondary btn-sm btn-change-role" data-email="${member.email}">Change Role</button>
        <button class="btn btn-danger btn-sm btn-remove" data-email="${member.email}">Remove</button>
      </div></td>
    </tr>`;
  }

  async function init() {
    if (App.state.role !== 'Admin') return;
    document.getElementById('btn-add-member')?.addEventListener('click', showAddModal);
    try {
      const data = await ApiClient.get('/team/members');
      members = (data && (data.members || data)) || [];
      if (!Array.isArray(members)) members = [];
      if (members.length === 0) { showEmpty(); return; }
      showContent();
      document.getElementById('team-tbody').innerHTML = members.map(renderRow).join('');
      bindTableEvents();
    } catch (err) {
      showEmpty();
    }
  }

  function showEmpty() {
    document.getElementById('team-loading')?.classList.add('hidden');
    document.getElementById('team-empty')?.classList.remove('hidden');
    document.getElementById('team-content')?.classList.add('hidden');
  }

  function showContent() {
    document.getElementById('team-loading')?.classList.add('hidden');
    document.getElementById('team-empty')?.classList.add('hidden');
    document.getElementById('team-content')?.classList.remove('hidden');
  }

  function bindTableEvents() {
    document.getElementById('team-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const email = btn.dataset.email;
      const member = members.find(m => m.email === email);
      if (!member) return;
      if (btn.classList.contains('btn-change-role')) showChangeRoleModal(member);
      else if (btn.classList.contains('btn-remove')) showRemoveModal(member);
    });
  }

  function showAddModal() {
    const body = `
      <form id="add-member-form">
        <div class="form-group"><label for="add-email">Email</label><input type="email" id="add-email" placeholder="user@example.com" required></div>
        <div class="form-group"><label for="add-role">Role</label><select id="add-role"><option value="Viewer">Viewer</option><option value="Admin">Admin</option></select></div>
        <button type="submit" class="btn btn-primary btn-block mt-16">Add Member</button>
      </form>
    `;
    App.showModal('Add Member', body);
    document.getElementById('add-member-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await ApiClient.post('/team/members', { email: document.getElementById('add-email').value, role: document.getElementById('add-role').value });
        App.hideModal();
        init();
      } catch (err) { alert(err.message || 'ไม่สามารถเพิ่มสมาชิกได้'); }
    });
  }

  function showChangeRoleModal(member) {
    const newRole = member.role === 'Admin' ? 'Viewer' : 'Admin';
    if (member.role === 'Admin' && getAdminCount() <= 1) {
      App.showModal('ไม่สามารถเปลี่ยน Role ได้', `<div class="alert alert-warning">ต้องมี Admin อย่างน้อย 1 คนในระบบ</div><button class="btn btn-secondary btn-block mt-16" onclick="App.hideModal()">ปิด</button>`);
      return;
    }
    const body = `
      <p>เปลี่ยน role ของ <strong>${member.email}</strong></p>
      <div class="form-group mt-16"><label for="new-role">New Role</label><select id="new-role"><option value="Admin" ${newRole==='Admin'?'selected':''}>Admin</option><option value="Viewer" ${newRole==='Viewer'?'selected':''}>Viewer</option></select></div>
      <button id="confirm-role-change" class="btn btn-primary btn-block mt-16">Save</button>
    `;
    App.showModal('Change Role', body);
    document.getElementById('confirm-role-change')?.addEventListener('click', async () => {
      try {
        await ApiClient.put('/team/members/' + encodeURIComponent(member.email) + '/role', { role: document.getElementById('new-role').value });
        App.hideModal();
        init();
      } catch (err) { alert(err.message || 'ไม่สามารถเปลี่ยน role ได้'); }
    });
  }

  function showRemoveModal(member) {
    if (member.email === App.state.user) {
      App.showModal('ไม่สามารถลบได้', `<div class="alert alert-warning">ไม่สามารถลบตัวเองออกจากทีมได้</div><button class="btn btn-secondary btn-block mt-16" onclick="App.hideModal()">ปิด</button>`);
      return;
    }
    if (member.role === 'Admin' && getAdminCount() <= 1) {
      App.showModal('ไม่สามารถลบได้', `<div class="alert alert-warning">ต้องมี Admin อย่างน้อย 1 คนในระบบ</div><button class="btn btn-secondary btn-block mt-16" onclick="App.hideModal()">ปิด</button>`);
      return;
    }
    const body = `
      <p>คุณต้องการลบ <strong>${member.email}</strong> ออกจากทีมหรือไม่?</p>
      <p class="text-secondary mt-8" style="font-size:0.88rem;">การดำเนินการนี้จะลบ user ออกจากระบบและ revoke ทุก sessions</p>
      <div class="flex gap-8 mt-16"><button id="confirm-remove" class="btn btn-danger" style="flex:1;">Remove</button><button id="cancel-remove" class="btn btn-secondary" style="flex:1;">Cancel</button></div>
    `;
    App.showModal('Remove Member', body);
    document.getElementById('confirm-remove')?.addEventListener('click', async () => {
      try { await ApiClient.del('/team/members/' + encodeURIComponent(member.email)); App.hideModal(); init(); } catch (err) { alert(err.message || 'ไม่สามารถลบได้'); }
    });
    document.getElementById('cancel-remove')?.addEventListener('click', () => App.hideModal());
  }

  return { render, init };
})();
