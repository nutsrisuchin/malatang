// app.js — state, rendering, and all business logic for Malatang.
// One state object, one render() dispatcher, one data-action/data-form
// dispatch pattern. No framework, no build step.

// ============================================================
// Constants
// ============================================================

const ROLE_RANK = { employee: 1, manager: 2, admin: 3, owner: 4 };
const ROLE_LABELS = { owner: 'เจ้าของร้าน', admin: 'แอดมิน', manager: 'ผู้จัดการ', employee: 'พนักงาน' };
const EMPLOYMENT_LABELS = { 'full-time': 'เต็มเวลา', 'part-time': 'พาร์ทไทม์' };

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_WEEKDAYS_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส'];

const NAV_ITEMS = [
  { view: 'home', label: 'หน้าหลัก', icon: '🏠', min: 'employee' },
  { view: 'timesheet', label: 'ลงเวลา', icon: '🕒', min: 'employee' },
  { view: 'warehouse', label: 'คลังสินค้า', icon: '📦', min: 'employee' },
  { view: 'checklist', label: 'เช็คลิสต์', icon: '✅', min: 'employee' },
  { view: 'admin', label: 'แอดมิน', icon: '⚙️', min: 'admin' },
  { view: 'financial', label: 'การเงิน', icon: '💰', min: 'admin' },
  { view: 'notifications', label: 'แจ้งเตือน', icon: '🔔', min: 'employee' },
];

// ============================================================
// State
// ============================================================

const state = {
  user: null, // { id, name, role, employmentType }
  view: 'home',
  staff: [],
  staffPay: {}, // { [staffId]: dailyRate } — only populated for admin+
  attendance: [],
  warehouseItems: [],
  warehouseLogs: [],
  routines: [],
  routineInspections: [],
  notifications: [],
  holidays: [],
  scheduleMonth: currentYYYYMM(),
  financialMonth: currentYYYYMM(),
  categoryOpen: {},
  attendancePanelOpen: false,
};

let unsubscribers = [];

// ============================================================
// Date / formatting helpers
// ============================================================

function pad2(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthDates(ym) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${y}-${pad2(m)}-${pad2(i + 1)}`);
}

function monthLabelThai(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

function formatDateThai(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

function weekdayThai(dateStr) {
  return THAI_WEEKDAYS_SHORT[new Date(dateStr + 'T00:00:00').getDay()];
}

function toMillis(ts) {
  if (!ts) return 0;
  return ts.toMillis ? ts.toMillis() : new Date(ts).getTime();
}

function dateStrOf(ts) {
  const d = ts && ts.toMillis ? new Date(ts.toMillis()) : new Date(ts || Date.now());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateTimeThai(ts) {
  if (!ts) return '';
  const d = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatBaht(n) {
  return `฿${Math.round(n).toLocaleString('th-TH')}`;
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function shortName(name) {
  return name && name.length > 10 ? name.slice(0, 9) + '…' : name;
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'อื่นๆ';
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

function byCreatedAtDesc(a, b) {
  return toMillis(b.createdAt) - toMillis(a.createdAt);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ============================================================
// Role helpers
// ============================================================

function roleAtLeast(role, min) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);
}

function isManager() { return state.user && roleAtLeast(state.user.role, 'manager'); }
function isAdmin() { return state.user && roleAtLeast(state.user.role, 'admin'); }
function isOwner() { return state.user && state.user.role === 'owner'; }

function canManageStaffMember(target) {
  const me = state.user;
  if (!me) return false;
  if (me.role === 'owner') return true;
  if (me.role === 'admin') return target.role !== 'owner';
  if (me.role === 'manager') return target.role === 'employee';
  return false;
}

// ============================================================
// Business logic
// ============================================================

function getAttendance(staffId, date) {
  const rec = state.attendance.find((a) => a.staffId === staffId && a.date === date);
  return rec || { staffId, date, dayOff: false, closedTill: false, lateMinutes: 0, clockIn: null, clockOut: null };
}

function isHoliday(dateStr) {
  return state.holidays.some((h) => h.date === dateStr);
}

// A day's pay: flat daily rate, minus ฿40 per full hour late, ×1.5 on a
// holiday, +฿50 flat bonus for closing the till. Returns null when the
// rate isn't known (i.e. the viewer isn't admin+ and never got staffPay).
function computePay(staffId, dateStr) {
  const rate = state.staffPay[staffId];
  if (rate == null) return null;
  const att = getAttendance(staffId, dateStr);
  if (att.dayOff) return 0;
  const lateHours = Math.floor((att.lateMinutes || 0) / 60);
  let pay = Math.max(0, rate - lateHours * 40);
  if (isHoliday(dateStr)) pay *= 1.5;
  if (att.closedTill) pay += 50;
  return Math.round(pay);
}

async function saveAttendanceException(staffId, date, patch) {
  const id = `${staffId}_${date}`;
  const current = getAttendance(staffId, date);
  const merged = { ...current, ...patch, staffId, date };
  const isDefault = !merged.dayOff && !merged.closedTill && !(merged.lateMinutes > 0) && !merged.clockIn && !merged.clockOut;
  if (isDefault) {
    await DB.deleteDoc('attendance', id).catch(() => {});
  } else {
    await DB.setDoc('attendance', id, merged, false);
  }
}

// Average daily usage is computed only from periods where quantity
// actually decreased (restocking doesn't read as negative usage), then
// projected forward.
function restockInfo(item) {
  const logs = state.warehouseLogs
    .filter((l) => l.itemId === item.id && l.delta < 0)
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  if (logs.length < 2) return { daysRemaining: null, level: 'ok', text: 'ยังไม่มีข้อมูลเพียงพอ' };
  const first = toMillis(logs[0].createdAt);
  const last = toMillis(logs[logs.length - 1].createdAt);
  const totalDecrease = logs.reduce((s, l) => s + Math.abs(l.delta), 0);
  const days = Math.max(1, (last - first) / 86400000);
  const avgDaily = totalDecrease / days;
  if (avgDaily <= 0) return { daysRemaining: null, level: 'ok', text: 'ยังไม่มีข้อมูลเพียงพอ' };
  const daysRemaining = item.quantity / avgDaily;
  const level = daysRemaining < 3 ? 'low' : daysRemaining < 7 ? 'medium' : 'ok';
  return { daysRemaining, level, text: `เหลือประมาณ ${daysRemaining.toFixed(1)} วัน` };
}

function routineStatus(routine) {
  const inspections = state.routineInspections
    .filter((i) => i.routineId === routine.id)
    .sort((a, b) => toMillis(b.completedAt) - toMillis(a.completedAt));
  const last = inspections[0];
  const todayDate = todayStr();
  const completedToday = inspections.some((i) => dateStrOf(i.completedAt) === todayDate);
  let due, overdue = false;
  if (routine.recurrenceType === 'weekdays') {
    const scheduledToday = (routine.weekdays || []).includes(new Date().getDay());
    due = scheduledToday && !completedToday;
  } else {
    const intervalDays = routine.intervalDays || 1;
    if (!last) {
      due = true;
    } else {
      const daysSince = Math.floor((Date.now() - toMillis(last.completedAt)) / 86400000);
      due = daysSince >= intervalDays;
      overdue = daysSince > intervalDays;
    }
  }
  return { due, overdue, last };
}

// ============================================================
// Image compression (no Firebase Storage — inline base64 instead)
// ============================================================

function compressImageFile(file, maxWidth = 640, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// Toasts
// ============================================================

function toast(msg, type = '') {
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function friendlyAuthError(err) {
  const code = err && err.code;
  const map = {
    'auth/wrong-password': 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบผู้ใช้นี้',
    'auth/invalid-email': 'ชื่อผู้ใช้ไม่ถูกต้อง',
    'auth/email-already-in-use': 'มีชื่อผู้ใช้นี้อยู่แล้ว กรุณาใช้ชื่ออื่น',
    'auth/weak-password': 'PIN ควรมีอย่างน้อย 6 หลัก',
    'auth/requires-recent-login': 'กรุณาออกจากระบบแล้วเข้าใหม่ก่อนเปลี่ยน PIN',
    'auth/invalid-credential': 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง',
    'permission-denied': 'ไม่มีสิทธิ์ทำรายการนี้',
  };
  return map[code] || (err && err.message) || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

async function addNotification(text) {
  try {
    await DB.addDoc('notifications', { text, actor: state.user.name, createdAt: DB.serverTimestamp() });
  } catch (err) {
    console.error('[notification] failed:', err);
  }
}

// ============================================================
// Modal system
// ============================================================

function openModal(innerHtml) {
  const host = document.getElementById('modal-host');
  host.innerHTML = `<div class="modal-card">${innerHtml}</div>`;
  host.classList.add('active');
}

function closeModal() {
  const host = document.getElementById('modal-host');
  host.classList.remove('active');
  host.innerHTML = '';
}

// ============================================================
// Render: shell
// ============================================================

function render() {
  if (!state.user) return;
  if ((state.view === 'admin' || state.view === 'financial') && !roleAtLeast(state.user.role, 'admin')) {
    state.view = 'home';
  }

  document.getElementById('sidebar-nav').innerHTML = renderSidebarNav();

  const view = document.getElementById('view');
  switch (state.view) {
    case 'home': view.innerHTML = renderHome(); break;
    case 'timesheet': view.innerHTML = renderTimesheet(); break;
    case 'warehouse': view.innerHTML = renderWarehouse(); break;
    case 'checklist': view.innerHTML = renderChecklist(); break;
    case 'admin': view.innerHTML = renderAdmin(); break;
    case 'financial': view.innerHTML = renderFinancial(); break;
    case 'notifications': view.innerHTML = renderNotifications(); break;
    default: view.innerHTML = renderHome();
  }

  updateTopbarUserInfo();
}

function updateTopbarUserInfo() {
  const el = document.getElementById('topbar-user-info');
  if (!el || !state.user) return;
  el.innerHTML = `${escapeHtml(state.user.name)}<span class="role-badge">${ROLE_LABELS[state.user.role]}</span>`;
}

function renderSidebarNav() {
  const role = state.user.role;
  const items = NAV_ITEMS.filter((i) => roleAtLeast(role, i.min)).map((i) => `
    <button class="nav-item ${state.view === i.view ? 'active' : ''}" data-action="navigate" data-view="${i.view}">
      <span class="icon">${i.icon}</span><span>${escapeHtml(i.label)}</span>
    </button>`).join('');
  return `${items}<button class="nav-item logout" data-action="logout"><span class="icon">🚪</span><span>ออกจากระบบ</span></button>`;
}

// ============================================================
// Render: Home
// ============================================================

function renderHome() {
  const today = todayStr();
  const activeStaff = state.staff.filter((s) => s.active !== false);
  const presentCount = activeStaff.filter((s) => !getAttendance(s.id, today).dayOff).length;
  const dueRoutines = state.routines.filter((r) => routineStatus(r).due).length;
  const overdueRoutines = state.routines.filter((r) => routineStatus(r).overdue).length;
  const lowStock = state.warehouseItems.filter((i) => restockInfo(i).level === 'low').length;
  const recentNotifs = [...state.notifications].sort(byCreatedAtDesc).slice(0, 5);

  return `
    <div class="screen-header">
      <div><h2>สวัสดี, ${escapeHtml(state.user.name)}</h2><div class="sub">${formatDateThai(today)}</div></div>
    </div>
    <div class="grid-3">
      <div class="stat-card">
        <div class="stat-value">${presentCount}/${activeStaff.length}</div>
        <div class="stat-label">พนักงานเข้างานวันนี้</div>
      </div>
      <div class="stat-card gold" style="cursor:pointer" data-action="navigate" data-view="checklist">
        <div class="stat-value">${dueRoutines}</div>
        <div class="stat-label">เช็คลิสต์ที่ต้องทำวันนี้ (เกินกำหนด ${overdueRoutines})</div>
      </div>
      <div class="stat-card" style="cursor:pointer;background:linear-gradient(135deg,var(--color-primary-dark),var(--color-primary))" data-action="navigate" data-view="warehouse">
        <div class="stat-value">${lowStock}</div>
        <div class="stat-label">สินค้าใกล้หมด</div>
      </div>
    </div>
    <div class="card">
      <h3>แจ้งเตือนล่าสุด</h3>
      ${recentNotifs.length ? recentNotifs.map(renderNotificationItem).join('') : '<div class="empty-state">ยังไม่มีการแจ้งเตือน</div>'}
    </div>
  `;
}

// ============================================================
// Render: Timesheet
// ============================================================

function renderTimesheet() {
  return isManager() ? renderTimesheetManager() : renderTimesheetEmployee();
}

function renderTimesheetManager() {
  const today = todayStr();
  // Admins and the Owner aren't scheduled/clocked staff — only Managers
  // and Employees appear in the daily panel and monthly grid.
  const activeStaff = state.staff
    .filter((s) => s.active !== false && (s.role === 'employee' || s.role === 'manager'))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const panelOpen = state.attendancePanelOpen;

  const dailyRows = activeStaff.map((s) => {
    const att = getAttendance(s.id, today);
    return `
      <div class="attendance-today-row">
        <div class="avatar">${initials(s.name)}</div>
        <div class="info">
          <div class="title">${escapeHtml(s.name)}</div>
          <div class="meta">
            ${att.dayOff ? '<span class="badge badge-muted">ลาวันนี้</span>' : '<span class="badge badge-success">เข้างาน</span>'}
            ${att.closedTill ? '<span class="badge badge-warning">ปิดร้าน +50</span>' : ''}
            ${att.lateMinutes ? `<span class="badge badge-danger">สาย ${att.lateMinutes} นาที</span>` : ''}
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-sm ${att.dayOff ? 'btn-outline' : 'btn-ghost'}" data-action="quick-toggle-dayoff" data-staff="${s.id}" data-date="${today}">ลา</button>
          <button class="btn btn-sm ${att.closedTill ? 'btn-gold' : 'btn-ghost'}" data-action="quick-toggle-till" data-staff="${s.id}" data-date="${today}">ปิดร้าน</button>
          <button class="btn btn-sm btn-outline" data-action="open-schedule-cell-modal" data-staff="${s.id}" data-date="${today}">แก้ไข</button>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="screen-header"><div><h2>ลงเวลา</h2><div class="sub">จัดการเวลาเข้างานและตารางเดือน</div></div></div>
    <div class="card attendance-panel">
      <div class="category-header" style="cursor:pointer;margin:-18px -18px 0;padding:14px 18px;border-radius:14px 14px 0 0" data-action="toggle-attendance-panel">
        <span>ใครเข้างานวันนี้ (${formatDateThai(today)})</span>
        <span class="chevron">${panelOpen ? '▾' : '▸'}</span>
      </div>
      ${panelOpen ? `<div style="margin-top:8px">${dailyRows || '<div class="empty-state">ไม่มีพนักงาน</div>'}</div>` : ''}
    </div>
    ${renderScheduleGrid(activeStaff, true)}
  `;
}

function renderTimesheetEmployee() {
  return `
    <div class="screen-header"><div><h2>ลงเวลาของฉัน</h2><div class="sub">ตารางเดือนของคุณ (อ่านอย่างเดียว)</div></div></div>
    ${renderScheduleGrid([state.user], false)}
  `;
}

function renderScheduleGrid(staffList, editable) {
  const ym = state.scheduleMonth;
  const dates = monthDates(ym);
  const header = `<th class="day-col">วันที่</th>` + staffList.map((s) => `<th>${escapeHtml(shortName(s.name))}</th>`).join('');

  const rows = dates.map((date) => {
    const d = new Date(date + 'T00:00:00');
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const cells = staffList.map((s) => {
      const att = getAttendance(s.id, date);
      let cls = 'present', label = '—';
      if (att.dayOff) { cls = 'dayoff'; label = 'หยุด'; }
      else if (att.lateMinutes > 0) { cls = 'late'; label = 'สาย'; }
      if (att.closedTill) { label += ' ★'; if (!att.dayOff) cls = 'till'; }
      const attrs = editable ? `data-action="open-schedule-cell-modal" data-staff="${s.id}" data-date="${date}" style="cursor:pointer"` : '';
      return `<td class="${isWeekend ? 'weekend' : ''}"><span class="schedule-cell ${cls}" ${attrs}>${label}</span></td>`;
    }).join('');
    return `<tr><td class="day-col ${isWeekend ? 'weekend' : ''}">${d.getDate()} ${weekdayThai(date)}</td>${cells}</tr>`;
  }).join('');

  return `
    <div class="card">
      <div class="screen-header" style="margin-bottom:12px">
        <h3 style="margin:0">ตารางเดือน — ${monthLabelThai(ym)}</h3>
        <div class="month-picker"><input type="month" value="${ym}" data-action="change-schedule-month" /></div>
      </div>
      <div class="schedule-scroll">
        <table class="schedule-grid"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

// ============================================================
// Render: Warehouse
// ============================================================

function renderWarehouse() {
  const canEdit = isManager();
  const categories = groupBy(state.warehouseItems, 'category');
  const catNames = Object.keys(categories).sort((a, b) => a.localeCompare(b, 'th'));
  const restockList = state.warehouseItems
    .map((i) => ({ item: i, info: restockInfo(i) }))
    .filter((x) => x.info.level !== 'ok')
    .sort((a, b) => (a.info.daysRemaining ?? 999) - (b.info.daysRemaining ?? 999));

  return `
    <div class="screen-header">
      <div><h2>คลังสินค้า</h2><div class="sub">สต๊อกวัตถุดิบและอุปกรณ์</div></div>
      ${canEdit ? `<button class="btn btn-primary" data-action="open-add-warehouse-modal">+ เพิ่มรายการ</button>` : ''}
    </div>
    ${restockList.length ? `
    <div class="card">
      <h3>ควรสั่งเพิ่มเร็วๆ นี้</h3>
      ${restockList.map((x) => `
        <div class="list-row">
          <div class="info">
            <div class="title">${escapeHtml(x.item.name)}</div>
            <div class="restock-flag ${x.info.level}">${escapeHtml(x.info.text)}</div>
          </div>
          <div class="badge badge-${x.info.level === 'low' ? 'danger' : 'warning'}">${x.info.level === 'low' ? 'ด่วน' : 'เฝ้าระวัง'}</div>
        </div>`).join('')}
    </div>` : ''}
    ${catNames.length ? catNames.map((cat) => renderWarehouseCategory(cat, categories[cat], canEdit)).join('') : '<div class="empty-state">ยังไม่มีรายการในคลัง</div>'}
  `;
}

function renderWarehouseCategory(cat, items, canEdit) {
  const open = !!state.categoryOpen[cat];
  return `
    <div class="category ${open ? 'open' : ''}">
      <div class="category-header" data-action="toggle-category" data-cat="${escapeHtml(cat)}">
        <span>${escapeHtml(cat)} (${items.length})</span><span class="chevron">▸</span>
      </div>
      <div class="category-body">${items.map((item) => renderWarehouseItem(item, canEdit)).join('')}</div>
    </div>`;
}

function renderWarehouseItem(item, canEdit) {
  const info = restockInfo(item);
  return `
    <div class="warehouse-item">
      ${item.photo ? `<img class="thumb" src="${item.photo}" alt="${escapeHtml(item.name)}" />` : `<div class="thumb placeholder">📦</div>`}
      <div class="info">
        <div class="title">${escapeHtml(item.name)}</div>
        <div class="meta">${item.quantity} ${escapeHtml(item.unit || 'หน่วย')}</div>
        ${info.daysRemaining != null ? `<div class="restock-flag ${info.level}">เหลือ ~${info.daysRemaining.toFixed(1)} วัน</div>` : ''}
      </div>
      ${canEdit ? `
        <div class="qty-controls">
          <button class="qty-btn" data-action="wh-qty-dec" data-id="${item.id}">−</button>
          <input type="number" value="${item.quantity}" data-action="wh-qty-set" data-id="${item.id}" />
          <button class="qty-btn" data-action="wh-qty-inc" data-id="${item.id}">+</button>
        </div>
        <label class="btn btn-sm btn-outline btn-icon" title="เปลี่ยนรูป">📷
          <input type="file" accept="image/*" capture="environment" data-action="wh-photo-select" data-id="${item.id}" style="display:none" />
        </label>
        <button class="btn btn-sm btn-ghost btn-icon" data-action="delete-warehouse-item" data-id="${item.id}">🗑</button>
      ` : ''}
    </div>`;
}

// ============================================================
// Render: Checklist
// ============================================================

function renderChecklist() {
  const canManage = isManager();
  const routines = [...state.routines].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return `
    <div class="screen-header">
      <div><h2>เช็คลิสต์</h2><div class="sub">งานตรวจเช็คประจำวัน/ประจำสัปดาห์</div></div>
      ${canManage ? `<button class="btn btn-primary" data-action="open-add-routine-modal">+ เพิ่มเช็คลิสต์</button>` : ''}
    </div>
    ${routines.length ? routines.map((r) => renderRoutineCard(r, canManage)).join('') : '<div class="empty-state">ยังไม่มีเช็คลิสต์</div>'}
  `;
}

function renderRoutineCard(routine, canManage) {
  const status = routineStatus(routine);
  const recurText = routine.recurrenceType === 'weekdays'
    ? `ทุกวัน ${(routine.weekdays || []).map((w) => THAI_WEEKDAYS_SHORT[w]).join(', ') || '—'}`
    : `ทุก ${routine.intervalDays || 1} วัน`;
  const statusBadge = status.overdue
    ? '<span class="badge badge-danger">เกินกำหนด</span>'
    : status.due
      ? '<span class="badge badge-warning">ต้องทำวันนี้</span>'
      : '<span class="badge badge-success">เรียบร้อย</span>';

  return `
    <div class="card routine-card ${status.overdue ? 'overdue' : ''}">
      <div class="screen-header" style="margin-bottom:8px">
        <div>
          <h3 style="margin:0">${escapeHtml(routine.name)} ${routine.timeTag ? `<span class="tag-pill">${routine.timeTag === 'open' ? 'ก่อนเปิดร้าน' : 'หลังปิดร้าน'}</span>` : ''}</h3>
          <div class="sub">${recurText}${status.last ? ` · ล่าสุด ${formatDateThai(dateStrOf(status.last.completedAt))} โดย ${escapeHtml(status.last.staffName || '')}` : ' · ยังไม่เคยทำ'}</div>
        </div>
        ${statusBadge}
      </div>
      ${routine.instructions ? `<p style="color:var(--color-text-muted);font-size:14px">${escapeHtml(routine.instructions)}</p>` : ''}
      <div class="modal-actions" style="margin-top:12px">
        <button class="btn btn-primary" data-action="open-routine-report-modal" data-id="${routine.id}">ทำเช็คลิสต์นี้</button>
        ${canManage ? `<button class="btn btn-ghost" data-action="delete-routine" data-id="${routine.id}">ลบ</button>` : ''}
      </div>
    </div>`;
}

// ============================================================
// Render: Admin
// ============================================================

function renderAdmin() {
  const staffSorted = [...state.staff].sort((a, b) => (ROLE_RANK[b.role] - ROLE_RANK[a.role]) || a.name.localeCompare(b.name, 'th'));
  return `
    <div class="screen-header">
      <div><h2>แอดมิน</h2><div class="sub">จัดการบัญชีพนักงาน</div></div>
      <button class="btn btn-primary" data-action="open-add-staff-modal">+ เพิ่มพนักงาน</button>
    </div>
    <div class="card">${staffSorted.map(renderStaffRow).join('') || '<div class="empty-state">ยังไม่มีพนักงาน</div>'}</div>
  `;
}

function renderStaffRow(s) {
  const canEditThis = canManageStaffMember(s);
  return `
    <div class="list-row">
      <div class="avatar">${initials(s.name)}</div>
      <div class="info">
        <div class="title">${escapeHtml(s.name)} <span class="badge badge-${s.role}">${ROLE_LABELS[s.role]}</span></div>
        <div class="meta">${EMPLOYMENT_LABELS[s.employmentType] || ''} ${s.active === false ? '<span class="badge badge-muted">ปิดใช้งาน</span>' : ''}</div>
      </div>
      ${canEditThis ? `
        <div class="actions">
          <button class="btn btn-sm btn-outline" data-action="open-edit-staff-modal" data-id="${s.id}">แก้ไข</button>
          ${s.role !== 'owner' ? `<button class="btn btn-sm btn-ghost" data-action="delete-staff" data-id="${s.id}">ลบ</button>` : ''}
        </div>` : ''}
    </div>`;
}

// ============================================================
// Render: Financial
// ============================================================

function renderFinancial() {
  const ym = state.financialMonth;
  const activeStaff = state.staff.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const dates = monthDates(ym);

  const rows = activeStaff.map((s) => {
    const rate = state.staffPay[s.id];
    const total = rate == null ? null : dates.reduce((sum, d) => sum + (computePay(s.id, d) || 0), 0);
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${rate != null ? formatBaht(rate) : '—'}</td>
      <td>${total != null ? formatBaht(total) : '—'}</td>
      <td><button class="btn btn-sm btn-outline" data-action="open-edit-staff-modal" data-id="${s.id}">แก้ไขค่าจ้าง</button></td>
    </tr>`;
  }).join('');

  const holidaysSorted = [...state.holidays].sort((a, b) => a.date.localeCompare(b.date));

  return `
    <div class="screen-header">
      <div><h2>การเงิน</h2><div class="sub">สรุปเงินเดือนพนักงานรายเดือน</div></div>
      <div class="month-picker"><input type="month" value="${ym}" data-action="change-financial-month" /></div>
    </div>
    <div class="card">
      <h3>เงินเดือนโดยประมาณ — ${monthLabelThai(ym)}</h3>
      <div style="overflow-x:auto">
        <table class="table-simple">
          <thead><tr><th>ชื่อ</th><th>ค่าจ้าง/วัน</th><th>รวมประมาณการ</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">ยังไม่มีพนักงาน</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h3>วันหยุดนักขัตฤกษ์ (จ่าย 1.5 เท่า)</h3>
      <form data-form="add-holiday" class="form-row" style="align-items:flex-end">
        <div class="field"><label>วันที่</label><input type="date" name="date" required /></div>
        <div class="field"><label>ชื่อวันหยุด</label><input type="text" name="label" placeholder="เช่น วันสงกรานต์" /></div>
        <button type="submit" class="btn btn-primary">เพิ่ม</button>
      </form>
      <div style="margin-top:12px">
        ${holidaysSorted.map((h) => `
          <span class="tag-pill">${formatDateThai(h.date)} ${h.label ? `— ${escapeHtml(h.label)}` : ''}
            <button data-action="delete-holiday" data-id="${h.id}" style="border:none;background:none;color:var(--color-danger);cursor:pointer;margin-left:4px">✕</button>
          </span>`).join('') || '<span class="empty-state">ยังไม่มีวันหยุด</span>'}
      </div>
    </div>
  `;
}

// ============================================================
// Render: Notifications
// ============================================================

function renderNotifications() {
  const items = [...state.notifications].sort(byCreatedAtDesc);
  return `
    <div class="screen-header"><div><h2>แจ้งเตือน</h2><div class="sub">กิจกรรมทั้งหมดในระบบ</div></div></div>
    <div class="card">${items.length ? items.map(renderNotificationItem).join('') : '<div class="empty-state">ยังไม่มีการแจ้งเตือน</div>'}</div>
  `;
}

function renderNotificationItem(n) {
  return `
    <div class="notification-item">
      <div class="dot"></div>
      <div><div>${escapeHtml(n.text)}</div><div class="meta">${formatDateTimeThai(n.createdAt)}</div></div>
    </div>`;
}

// ============================================================
// Modal builders
// ============================================================

function openPinModal() {
  openModal(`
    <div class="modal-header"><h3>เปลี่ยน PIN</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="change-pin">
      <div class="field"><label>PIN ใหม่</label><input type="password" name="newPin" inputmode="numeric" minlength="4" required /></div>
      <div class="field"><label>ยืนยัน PIN ใหม่</label><input type="password" name="confirmPin" inputmode="numeric" minlength="4" required /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
}

function openAddStaffModal() {
  const me = state.user;
  const roleOptions = me.role === 'manager' ? ['employee'] : ['employee', 'manager', 'admin'];
  openModal(`
    <div class="modal-header"><h3>เพิ่มพนักงาน</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="add-staff">
      <div class="field"><label>ชื่อ</label><input type="text" name="name" required /></div>
      <div class="field"><label>PIN (สำหรับเข้าสู่ระบบ, อย่างน้อย 6 หลัก)</label><input type="password" name="pin" inputmode="numeric" minlength="6" required /></div>
      <div class="form-row">
        <div class="field"><label>ตำแหน่ง</label>
          <select name="role">${roleOptions.map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select>
        </div>
        <div class="field"><label>ประเภทการจ้าง</label>
          <select name="employmentType"><option value="full-time">เต็มเวลา</option><option value="part-time">พาร์ทไทม์</option></select>
        </div>
      </div>
      ${isAdmin() ? `<div class="field"><label>ค่าจ้างต่อวัน (บาท)</label><input type="number" name="dailyRate" min="0" value="0" /></div>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
}

function openEditStaffModal(id) {
  const s = state.staff.find((x) => x.id === id);
  if (!s) return;
  const canChangeRole = isOwner() || (isAdmin() && s.role !== 'owner');
  const rate = state.staffPay[id];
  const roleChoices = ['employee', 'manager', 'admin'].concat(s.role === 'owner' ? ['owner'] : []);
  openModal(`
    <div class="modal-header"><h3>แก้ไขพนักงาน</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="edit-staff" data-id="${s.id}">
      <div class="field"><label>ชื่อ</label><input type="text" name="name" value="${escapeHtml(s.name)}" required /></div>
      <div class="form-row">
        <div class="field"><label>ตำแหน่ง</label>
          <select name="role" ${canChangeRole ? '' : 'disabled'}>
            ${roleChoices.map((r) => `<option value="${r}" ${s.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>ประเภทการจ้าง</label>
          <select name="employmentType">
            <option value="full-time" ${s.employmentType === 'full-time' ? 'selected' : ''}>เต็มเวลา</option>
            <option value="part-time" ${s.employmentType === 'part-time' ? 'selected' : ''}>พาร์ทไทม์</option>
          </select>
        </div>
      </div>
      ${isAdmin() ? `<div class="field"><label>ค่าจ้างต่อวัน (บาท)</label><input type="number" name="dailyRate" min="0" value="${rate != null ? rate : 0}" /></div>` : ''}
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:4px">
        <input type="checkbox" name="active" style="width:20px;height:20px" ${s.active !== false ? 'checked' : ''} /> เปิดใช้งานอยู่
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
}

function openAddWarehouseModal() {
  openModal(`
    <div class="modal-header"><h3>เพิ่มรายการคลังสินค้า</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="add-warehouse-item">
      <div class="field"><label>ชื่อรายการ</label><input type="text" name="name" required /></div>
      <div class="form-row">
        <div class="field"><label>หมวดหมู่</label><input type="text" name="category" placeholder="เช่น เนื้อสัตว์" required /></div>
        <div class="field"><label>หน่วย</label><input type="text" name="unit" placeholder="เช่น กก., ถุง" required /></div>
      </div>
      <div class="field"><label>จำนวนเริ่มต้น</label><input type="number" name="quantity" value="0" min="0" required /></div>
      <div class="field">
        <label>รูปภาพ (ถ้ามี)</label>
        <input type="file" accept="image/*" capture="environment" data-photo-field="photo" />
        <input type="hidden" name="photo" />
        <img id="photo-preview" class="photo-preview" style="display:none" />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
}

function openAddRoutineModal() {
  openModal(`
    <div class="modal-header"><h3>เพิ่มเช็คลิสต์</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="add-routine">
      <div class="field"><label>ชื่อเช็คลิสต์</label><input type="text" name="name" required /></div>
      <div class="field"><label>คำแนะนำ (ถ้ามี)</label><textarea name="instructions"></textarea></div>
      <div class="field"><label>รายการย่อย (บรรทัดละ 1 รายการ)</label><textarea name="subTasks" placeholder="เช่น&#10;เช็ดโต๊ะ&#10;ล้างมือ"></textarea></div>
      <div class="field">
        <label>ช่วงเวลา</label>
        <select name="timeTag"><option value="">ไม่ระบุ</option><option value="open">ก่อนเปิดร้าน</option><option value="close">หลังปิดร้าน</option></select>
      </div>
      <div class="field">
        <label>รูปแบบความถี่</label>
        <select name="recurrenceType">
          <option value="interval">ทุกกี่วัน</option>
          <option value="weekdays">ตามวันในสัปดาห์</option>
        </select>
      </div>
      <div class="field"><label>ถ้าเลือก "ทุกกี่วัน" — ทุกกี่วัน</label><input type="number" name="intervalDays" min="1" value="1" /></div>
      <div class="field">
        <label>ถ้าเลือก "ตามวันในสัปดาห์" — เลือกวัน</label>
        <div>${THAI_WEEKDAYS_SHORT.map((w, i) => `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 10px 2px 0;font-weight:400"><input type="checkbox" name="weekday-${i}" style="width:18px;height:18px" /> ${w}</label>`).join('')}</div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
}

function openRoutineReportModal(routineId) {
  const routine = state.routines.find((r) => r.id === routineId);
  if (!routine) return;
  const subtasks = routine.subTasks || [];
  openModal(`
    <div class="modal-header"><h3>${escapeHtml(routine.name)}</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="routine-report" data-routine-id="${routine.id}">
      ${subtasks.length
        ? subtasks.map((t, i) => `<label class="subtask-row"><input type="checkbox" name="subtask-${i}" /> <span>${escapeHtml(t)}</span></label>`).join('')
        : '<p style="color:var(--color-text-muted)">ไม่มีรายการย่อย</p>'}
      <div class="field" style="margin-top:12px"><label>หมายเหตุ (ถ้ามี)</label><textarea name="note"></textarea></div>
      <div class="field">
        <label>รูปถ่าย (ถ้ามี)</label>
        <input type="file" accept="image/*" capture="environment" data-photo-field="photo" />
        <input type="hidden" name="photo" />
        <img id="photo-preview" class="photo-preview" style="display:none" />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">ส่งรายงาน</button>
      </div>
    </form>
  `);
}

function openScheduleCellModal(staffId, date) {
  if (!isManager()) return;
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) return;
  const att = getAttendance(staffId, date);
  openModal(`
    <div class="modal-header"><h3>${escapeHtml(staff.name)}</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <p class="sub" style="margin-top:-8px">${formatDateThai(date)}</p>
    <form data-form="schedule-cell" data-staff="${staffId}" data-date="${date}">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400"><input type="checkbox" name="dayOff" style="width:20px;height:20px" ${att.dayOff ? 'checked' : ''} /> วันหยุด (ลา)</label>
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-top:8px"><input type="checkbox" name="closedTill" style="width:20px;height:20px" ${att.closedTill ? 'checked' : ''} /> ปิดร้าน/นับเงิน (+฿50)</label>
      <div class="form-row" style="margin-top:12px">
        <div class="field"><label>เวลาเข้างานจริง</label><input type="time" name="clockIn" value="${att.clockIn || ''}" /></div>
        <div class="field"><label>เวลาออกงานจริง</label><input type="time" name="clockOut" value="${att.clockOut || ''}" /></div>
      </div>
      <div class="field"><label>สายกี่นาที</label><input type="number" name="lateMinutes" min="0" value="${att.lateMinutes || 0}" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="reset-schedule-cell" data-staff="${staffId}" data-date="${date}">รีเซ็ตเป็นค่าเริ่มต้น</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
}

// ============================================================
// Action dispatch (data-action="...")
// ============================================================

async function handleAction(action, data, el) {
  try {
    switch (action) {
      case 'toggle-sidebar': {
        document.getElementById('sidebar').classList.toggle('open');
        document.querySelector('.sidebar-backdrop').classList.toggle('open');
        return;
      }
      case 'navigate': {
        state.view = data.view;
        document.getElementById('sidebar').classList.remove('open');
        document.querySelector('.sidebar-backdrop').classList.remove('open');
        render();
        return;
      }
      case 'logout': {
        await DB.logout();
        return;
      }
      case 'open-pin-modal': openPinModal(); return;
      case 'close-modal': closeModal(); return;

      case 'toggle-attendance-panel': state.attendancePanelOpen = !state.attendancePanelOpen; render(); return;
      case 'toggle-category': state.categoryOpen[data.cat] = !state.categoryOpen[data.cat]; render(); return;

      case 'change-schedule-month': state.scheduleMonth = el.value; render(); return;
      case 'change-financial-month': state.financialMonth = el.value; render(); return;

      case 'open-add-staff-modal': openAddStaffModal(); return;
      case 'open-edit-staff-modal': openEditStaffModal(data.id); return;
      case 'open-add-warehouse-modal': openAddWarehouseModal(); return;
      case 'open-add-routine-modal': openAddRoutineModal(); return;
      case 'open-routine-report-modal': openRoutineReportModal(data.id); return;
      case 'open-schedule-cell-modal': openScheduleCellModal(data.staff, data.date); return;

      case 'quick-toggle-dayoff': {
        if (!isManager()) return;
        const att = getAttendance(data.staff, data.date);
        await saveAttendanceException(data.staff, data.date, { dayOff: !att.dayOff });
        return;
      }
      case 'quick-toggle-till': {
        if (!isManager()) return;
        const att = getAttendance(data.staff, data.date);
        await saveAttendanceException(data.staff, data.date, { closedTill: !att.closedTill });
        return;
      }
      case 'reset-schedule-cell': {
        if (!isManager()) return;
        await saveAttendanceException(data.staff, data.date, { dayOff: false, closedTill: false, clockIn: null, clockOut: null, lateMinutes: 0 });
        closeModal();
        toast('รีเซ็ตแล้ว', 'success');
        return;
      }

      case 'wh-qty-inc':
      case 'wh-qty-dec': {
        if (!isManager()) return;
        const item = state.warehouseItems.find((i) => i.id === data.id);
        if (!item) return;
        const delta = action === 'wh-qty-inc' ? 1 : -1;
        await applyWarehouseQtyChange(item, Math.max(0, (item.quantity || 0) + delta));
        return;
      }
      case 'wh-qty-set': {
        if (!isManager()) return;
        const item = state.warehouseItems.find((i) => i.id === data.id);
        if (!item) return;
        await applyWarehouseQtyChange(item, Math.max(0, Number(el.value) || 0));
        return;
      }
      case 'wh-photo-select': {
        if (!isManager()) return;
        await DB.updateDoc('warehouseItems', data.id, { photo: data.photo });
        toast('อัปเดตรูปภาพแล้ว', 'success');
        return;
      }
      case 'delete-warehouse-item': {
        if (!isManager()) return;
        if (!confirm('ลบรายการนี้ออกจากคลังสินค้า?')) return;
        await DB.deleteDoc('warehouseItems', data.id);
        toast('ลบรายการแล้ว', 'success');
        return;
      }

      case 'delete-routine': {
        if (!isManager()) return;
        if (!confirm('ลบเช็คลิสต์นี้?')) return;
        await DB.deleteDoc('routines', data.id);
        toast('ลบแล้ว', 'success');
        return;
      }

      case 'delete-staff': {
        const target = state.staff.find((s) => s.id === data.id);
        if (!target || !canManageStaffMember(target) || target.role === 'owner') { toast('ไม่มีสิทธิ์ลบ', 'error'); return; }
        if (!confirm(`ลบพนักงาน ${target.name}? (บัญชีเข้าสู่ระบบจะยังไม่ถูกลบถาวร ต้องลบด้วยตนเองใน Firebase console)`)) return;
        await DB.deleteDoc('staff', data.id);
        await DB.deleteDoc('staffPay', data.id).catch(() => {});
        addNotification(`${state.user.name} ลบพนักงาน: ${target.name}`);
        toast('ลบพนักงานแล้ว', 'success');
        return;
      }

      case 'delete-holiday': {
        if (!isAdmin()) return;
        await DB.deleteDoc('holidays', data.id);
        toast('ลบวันหยุดแล้ว', 'success');
        return;
      }

      default:
        console.warn('[handleAction] unhandled action:', action);
    }
  } catch (err) {
    console.error(err);
    toast(friendlyAuthError(err), 'error');
  }
}

async function applyWarehouseQtyChange(item, newQty) {
  const delta = newQty - item.quantity;
  if (delta === 0) return;
  await DB.updateDoc('warehouseItems', item.id, { quantity: newQty });
  await DB.addDoc('warehouseLogs', {
    itemId: item.id, itemName: item.name, previousQty: item.quantity, newQty, delta,
    staffName: state.user.name, createdAt: DB.serverTimestamp(),
  });
}

// ============================================================
// Form dispatch (data-form="...")
// ============================================================

async function handleForm(name, formData, formEl) {
  try {
    switch (name) {
      case 'login': {
        const loginName = formData.get('name').trim();
        const pin = formData.get('pin');
        const btn = document.getElementById('login-submit-btn');
        btn.disabled = true;
        btn.textContent = 'กำลังเข้าสู่ระบบ...';
        document.getElementById('login-error-slot').innerHTML = '';
        try {
          await DB.loginWithNamePin(loginName, pin);
        } catch (err) {
          document.getElementById('login-error-slot').innerHTML = `<div class="login-error">${escapeHtml(friendlyAuthError(err))}</div>`;
        } finally {
          btn.disabled = false;
          btn.textContent = 'เข้าสู่ระบบ';
        }
        return;
      }

      case 'change-pin': {
        const p1 = formData.get('newPin'), p2 = formData.get('confirmPin');
        if (p1 !== p2) { toast('PIN ไม่ตรงกัน', 'error'); return; }
        if (p1.length < 4) { toast('PIN ต้องมีอย่างน้อย 4 หลัก', 'error'); return; }
        await DB.changeOwnPin(p1);
        closeModal();
        toast('เปลี่ยน PIN สำเร็จ', 'success');
        return;
      }

      case 'add-staff': {
        if (!isManager()) return;
        const staffName = formData.get('name').trim();
        const pin = formData.get('pin');
        const role = formData.get('role');
        const employmentType = formData.get('employmentType');
        const dailyRate = formData.get('dailyRate');
        if (state.user.role === 'manager' && role !== 'employee') { toast('ผู้จัดการเพิ่มได้เฉพาะพนักงานทั่วไป', 'error'); return; }
        const { uid } = await DB.createStaffAuthAccount(staffName, pin);
        await DB.setDoc('staff', uid, { name: staffName, role, employmentType, active: true, createdAt: DB.serverTimestamp() });
        if (isAdmin() && dailyRate !== null) {
          await DB.setDoc('staffPay', uid, { dailyRate: Number(dailyRate) || 0 });
        }
        addNotification(`${state.user.name} เพิ่มพนักงานใหม่: ${staffName}`);
        closeModal();
        toast('เพิ่มพนักงานสำเร็จ', 'success');
        return;
      }

      case 'edit-staff': {
        const id = formEl.dataset.id;
        const target = state.staff.find((s) => s.id === id);
        if (!target || !canManageStaffMember(target)) { toast('ไม่มีสิทธิ์แก้ไข', 'error'); return; }
        const staffName = formData.get('name').trim();
        const roleField = formEl.querySelector('[name="role"]');
        const role = roleField.disabled ? target.role : formData.get('role');
        const employmentType = formData.get('employmentType');
        const active = !!formData.get('active');
        await DB.updateDoc('staff', id, { name: staffName, role, employmentType, active });
        if (isAdmin() && formData.has('dailyRate')) {
          await DB.setDoc('staffPay', id, { dailyRate: Number(formData.get('dailyRate')) || 0 });
        }
        addNotification(`${state.user.name} แก้ไขข้อมูลพนักงาน: ${staffName}`);
        closeModal();
        toast('บันทึกแล้ว', 'success');
        return;
      }

      case 'add-warehouse-item': {
        if (!isManager()) return;
        const itemName = formData.get('name').trim();
        const category = formData.get('category').trim();
        const unit = formData.get('unit').trim();
        const quantity = Number(formData.get('quantity')) || 0;
        const photo = formData.get('photo') || null;
        const id = await DB.addDoc('warehouseItems', { name: itemName, category, unit, quantity, photo, createdAt: DB.serverTimestamp() });
        await DB.addDoc('warehouseLogs', { itemId: id, itemName, previousQty: 0, newQty: quantity, delta: quantity, staffName: state.user.name, createdAt: DB.serverTimestamp() });
        addNotification(`${state.user.name} เพิ่มรายการคลังสินค้า: ${itemName}`);
        closeModal();
        toast('เพิ่มรายการแล้ว', 'success');
        return;
      }

      case 'add-routine': {
        if (!isManager()) return;
        const routineName = formData.get('name').trim();
        const instructions = formData.get('instructions').trim();
        const subTasks = formData.get('subTasks').split('\n').map((s) => s.trim()).filter(Boolean);
        const timeTag = formData.get('timeTag') || null;
        const recurrenceType = formData.get('recurrenceType');
        const intervalDays = Number(formData.get('intervalDays')) || 1;
        const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((i) => formData.get(`weekday-${i}`));
        await DB.addDoc('routines', { name: routineName, instructions, subTasks, timeTag, recurrenceType, intervalDays, weekdays, createdAt: DB.serverTimestamp() });
        addNotification(`${state.user.name} เพิ่มเช็คลิสต์ใหม่: ${routineName}`);
        closeModal();
        toast('เพิ่มเช็คลิสต์แล้ว', 'success');
        return;
      }

      case 'routine-report': {
        const routineId = formEl.dataset.routineId;
        const routine = state.routines.find((r) => r.id === routineId);
        if (!routine) return;
        const subTasksChecked = (routine.subTasks || []).map((t, i) => ({ text: t, checked: !!formData.get(`subtask-${i}`) }));
        const note = formData.get('note').trim();
        const photo = formData.get('photo') || null;
        await DB.addDoc('routineInspections', {
          routineId, routineName: routine.name, staffId: state.user.id, staffName: state.user.name,
          subTasksChecked, note, photo, completedAt: DB.serverTimestamp(),
        });
        addNotification(`${state.user.name} ทำเช็คลิสต์: ${routine.name}`);
        closeModal();
        toast('ส่งรายงานแล้ว', 'success');
        return;
      }

      case 'schedule-cell': {
        if (!isManager()) return;
        const staffId = formEl.dataset.staff, date = formEl.dataset.date;
        const dayOff = !!formData.get('dayOff');
        const closedTill = !!formData.get('closedTill');
        const clockIn = formData.get('clockIn') || null;
        const clockOut = formData.get('clockOut') || null;
        const lateMinutes = Number(formData.get('lateMinutes')) || 0;
        await saveAttendanceException(staffId, date, { dayOff, closedTill, clockIn, clockOut, lateMinutes });
        const staff = state.staff.find((s) => s.id === staffId);
        addNotification(`${state.user.name} แก้ไขเวลาของ ${staff ? staff.name : ''} วันที่ ${formatDateThai(date)}`);
        closeModal();
        toast('บันทึกแล้ว', 'success');
        return;
      }

      case 'add-holiday': {
        if (!isAdmin()) return;
        const date = formData.get('date');
        const label = formData.get('label').trim();
        await DB.addDoc('holidays', { date, label, createdAt: DB.serverTimestamp() });
        addNotification(`${state.user.name} เพิ่มวันหยุด: ${formatDateThai(date)}`);
        formEl.reset();
        toast('เพิ่มวันหยุดแล้ว', 'success');
        return;
      }

      default:
        console.warn('[handleForm] unhandled form:', name);
    }
  } catch (err) {
    console.error(err);
    toast(friendlyAuthError(err), 'error');
  }
}

// ============================================================
// Global event wiring
// ============================================================

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target || target.matches('input[type="file"]')) return;
  handleAction(target.dataset.action, { ...target.dataset }, target);
});

document.addEventListener('change', async (e) => {
  const el = e.target;

  if (el.matches('input[type="file"]')) {
    const file = el.files[0];
    if (!file) return;
    let dataUrl;
    try {
      dataUrl = await compressImageFile(file);
    } catch (err) {
      console.error(err);
      toast('ประมวลผลรูปภาพไม่สำเร็จ', 'error');
      return;
    }

    if (el.dataset.action) {
      handleAction(el.dataset.action, { ...el.dataset, photo: dataUrl }, el);
    } else if (el.dataset.photoField) {
      const form = el.closest('form');
      const hidden = form && form.querySelector(`input[type="hidden"][name="${el.dataset.photoField}"]`);
      if (hidden) hidden.value = dataUrl;
      const preview = document.getElementById(`${el.dataset.photoField}-preview`);
      if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
    }
    return;
  }

  if (el.matches('[data-action]')) {
    handleAction(el.dataset.action, { ...el.dataset }, el);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  handleForm(form.dataset.form, new FormData(form), form);
});

document.getElementById('modal-host').addEventListener('click', (e) => {
  if (e.target.id === 'modal-host') closeModal();
});

// ============================================================
// Auth lifecycle & subscriptions
// ============================================================

function teardownSubscriptions() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
}

async function startSubscriptions() {
  teardownSubscriptions();
  unsubscribers.push(DB.subscribeCollection('staff', (items) => { state.staff = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('attendance', (items) => { state.attendance = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('warehouseItems', (items) => { state.warehouseItems = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('warehouseLogs', (items) => { state.warehouseLogs = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('routines', (items) => { state.routines = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('routineInspections', (items) => { state.routineInspections = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('notifications', (items) => { state.notifications = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('holidays', (items) => { state.holidays = items; render(); }));
  if (roleAtLeast(state.user.role, 'admin')) {
    unsubscribers.push(DB.subscribeCollection('staffPay', (items) => {
      state.staffPay = {};
      items.forEach((i) => { state.staffPay[i.id] = i.dailyRate; });
      render();
    }));
  }
}

DB.onAuthStateChanged(async (fbUser) => {
  if (!fbUser) {
    teardownSubscriptions();
    state.user = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').classList.remove('active');
    return;
  }

  try {
    let staffDoc = await DB.getDoc('staff', fbUser.uid);

    if (!staffDoc && fbUser.email === DB.OWNER_EMAIL) {
      await DB.setDoc('staff', fbUser.uid, {
        name: 'เจ้าของร้าน', role: 'owner', employmentType: 'full-time', active: true, createdAt: DB.serverTimestamp(),
      });
      staffDoc = await DB.getDoc('staff', fbUser.uid);
    }

    if (!staffDoc) {
      document.getElementById('login-error-slot').innerHTML =
        '<div class="login-error">ไม่พบโปรไฟล์พนักงานสำหรับบัญชีนี้ กรุณาติดต่อผู้ดูแลระบบ</div>';
      await DB.logout();
      return;
    }

    state.user = { id: fbUser.uid, name: staffDoc.name, role: staffDoc.role, employmentType: staffDoc.employmentType };
    state.view = 'home';

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').classList.add('active');

    await startSubscriptions();
    render();
  } catch (err) {
    console.error(err);
    document.getElementById('login-error-slot').innerHTML =
      `<div class="login-error">${escapeHtml(friendlyAuthError(err))}</div>`;
  }
});
