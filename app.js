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
const NOTIFICATIONS_PAGE_SIZE = 200;

// Shift schedule: weekdays run 10:00-22:00, weekends 09:00-21:00 — both a
// 12-hour span with a 1-hour unpaid break baked in, so a full normal day is
// always 11 paid hours. Pay is a flat hourly wage, not a per-employee rate.
const WEEKDAY_SHIFT = { start: '10:00', end: '22:00' };
const WEEKEND_SHIFT = { start: '09:00', end: '21:00' };
const BREAK_HOURS = 1;
const HOURLY_RATE = 40;
const FOOD_ALLOWANCE = 50;
const FOOD_ALLOWANCE_MIN_HOURS = 10; // paid when hoursWorked > this
const MANAGER_DILIGENCE_BONUS = 500; // เบี้ยขยัน — once per month, if she qualifies
const MANAGER_DILIGENCE_MAX_DAYS_OFF = 4; // forfeited once ลา days exceed this

const NAV_ITEMS = [
  { view: 'home', label: 'หน้าหลัก', icon: '🏠', min: 'employee' },
  { view: 'timesheet', label: 'ลงเวลา', icon: '🕒', min: 'employee' },
  { view: 'warehouse', label: 'คลังสินค้า', icon: '📦', min: 'employee' },
  { view: 'analytics', label: 'วิเคราะห์คลังสินค้า', icon: '📊', min: 'manager' },
  { view: 'checklist', label: 'เช็คลิสต์', icon: '✅', min: 'employee' },
  { view: 'rules', label: 'กฎระเบียบ', icon: '📜', min: 'employee' },
  { view: 'admin', label: 'แอดมิน', icon: '⚙️', min: 'admin' },
  { view: 'financial', label: 'การเงิน', icon: '💰', min: 'admin' },
  { view: 'notifications', label: 'แจ้งเตือน', icon: '🔔', min: 'employee' },
];

// Bump this string whenever WORK_RULES_SECTIONS' text actually changes —
// everyone's stored acknowledgment is compared against it, so a bump means
// the whole staff needs to re-acknowledge the updated rules.
const WORK_RULES_VERSION = '2026-08-17';

// From กฎระเบียบการทำงาน-หมาล่าทั่งระยอง.pdf
const WORK_RULES_SECTIONS = [
  { title: '1. เวลาทำการร้าน (เปิด–ปิด)', items: [
    'วันจันทร์–ศุกร์: เปิด 11:30 น. / ปิด 21:00 น.',
    'วันเสาร์–อาทิตย์: เปิด 11:00 น. / ปิด 20:00 น.',
    'Delivery: เปิดรับออเดอร์ 11:00 น.',
  ]},
  { title: '2. เวลาเข้า–เลิกงานของพนักงาน', items: [
    'วันจันทร์–ศุกร์: เข้างาน 10:00 น. เลิกงาน 22:00 น. (4 ทุ่ม)',
    'วันเสาร์–อาทิตย์: เข้างาน 09:00 น. เลิกงาน 21:00 น. (3 ทุ่ม)',
    'หากปฏิบัติงานหรือเก็บร้านเรียบร้อยก่อนเวลาเลิกงานที่กำหนด สามารถกลับก่อนเวลาได้',
    'มาสายไม่เกิน 10 นาที → ได้รับค่า O.T. 40 บาท',
    'มาสายเกิน 10 นาที แต่ไม่เกิน 30 นาที → ได้รับค่า O.T. 20 บาท',
    'หมายเหตุ: หากมาสายบ่อยครั้งติดต่อกันหลายวัน จะได้รับใบเตือนเป็นลายลักษณ์อักษร หากทราบล่วงหน้าว่าจะมาสายเนื่องจากติดธุระ ให้แจ้งในกลุ่มไลน์ทันที',
  ]},
  { title: '3. การแต่งกาย', items: [
    'พนักงานต้องสวมหมวกและผ้ากันเปื้อนตลอดเวลาที่ปฏิบัติงาน',
    'สามารถถอดหมวกและผ้ากันเปื้อนได้เฉพาะช่วงเวลาพักเบรกเท่านั้น',
  ]},
  { title: '4. การลางาน', items: [
    'ลาป่วย: แจ้งล่วงหน้าอย่างน้อย 3 ชั่วโมงก่อนเวลาเข้างาน',
    'ลากิจ: แจ้งล่วงหน้า 1–3 วัน',
    'การแจ้งลาออก (ต้องแจ้งล่วงหน้า 1 เดือน)',
    'หมายเหตุ: หยุดงานโดยไม่แจ้งครั้งแรก → ตักเตือนด้วยวาจา · หยุดงานโดยไม่แจ้งครั้งต่อไป → ได้รับใบเตือนเป็นลายลักษณ์อักษร · หากได้รับใบเตือนครบ 3 ใบ มีผลให้เลิกจ้างทันที',
  ]},
  { title: '5. วันหยุดและเวลาพัก', items: [
    'หยุดงานตามตารางที่บริษัทจัดให้',
    'พักได้คนละ 1 ชั่วโมงตามเวลาที่กำหนด หากพักเกินเวลาที่กำหนดหักเงินตามนาทีที่พักเกิน',
    'ห้ามรับประทานอาหารนอกเหนือช่วงเวลาพัก',
    'ไม่ควรออกไปทำธุระส่วนตัวนอกเวลาพัก หากมีความจำเป็นให้แจ้งหัวหน้างานก่อนทุกครั้ง',
  ]},
  { title: '6. การปฏิบัติตัวระหว่างทำงาน', items: [
    'ห้ามด่าหรือว่ากันในที่ทำงาน การทำงานเป็นทีมต้องรักษาน้ำใจกัน หากพบเจอจะส่งใบเตือนและยกเลิกการจ้างทันที',
    'หากมีปัญหาภายในร้าน ห้ามคุยกันเอง ให้แจ้งผู้จัดการหรือเจ้าของร้านเท่านั้น เพื่อช่วยกันแก้ไขและหาทางออก',
    'ห้ามสูบบุหรี่/ดื่มแอลกอฮอล์ในร้านขณะปฏิบัติงาน',
    'ห้ามเล่นโทรศัพท์ระหว่างทำงาน ยกเว้นกรณีไม่มีลูกค้าหรือช่วงเวลาพัก',
    'ห้ามหยอกล้อกันในระหว่างเวลางาน',
    'ไม่พูดคุยเสียงดังเกินไป',
    'ไม่เปิดเพลงเสียงดังเกินไป',
    'ห้ามนอนหลับในเวลางาน',
    'ห้ามประกอบอาหารอื่นนอกเหนือเมนูร้าน เว้นแต่ได้รับคำสั่งให้ทำ',
  ]},
  { title: '7. สิทธิ์ส่วนลดพนักงาน', items: [
    'พนักงาน 1 คน มีสิทธิ์ใช้ส่วนลดได้ 50% แต่ไม่เกิน 100 บาทต่อวัน',
    'ห้ามใช้สิทธิ์ส่วนลดแทนกัน',
    'น้ำจิ้มมีไว้สำหรับจำหน่าย ไม่ใช่ของแจกฟรี หากต้องการรับประทานต้องซื้อ',
  ]},
  { title: '8. การปรับอุณหภูมิเครื่องปรับอากาศ', items: [
    'โซนที่นั่งลูกค้า: ไม่ควรต่ำกว่า 23 องศา',
    'โซนเคาน์เตอร์: ไม่ควรต่ำกว่า 25 องศา',
    'โซนครัว: ไม่ควรต่ำกว่า 23 องศา',
    'หากพบว่าเครื่องปรับอากาศจุดใดไม่เย็น ให้รีบแจ้งหัวหน้างานทันที',
  ]},
  { title: '9. ความรับผิดชอบต่อข้อผิดพลาดในการทำงาน', items: [
    'การทำออเดอร์ผิดพลาดหรือจัดส่งไม่ครบ หากเกิดขึ้นบ่อยครั้ง อาจถูกหักเงินตามมูลค่าของออเดอร์นั้น',
    'การสั่งวัตถุดิบผิดหรือสั่งไม่ครบจนส่งผลให้ของไม่พอขาย พนักงานต้องรับผิดชอบตามมูลค่าของที่เสียหาย',
    'ห้ามนำทรัพย์สินร้าน (วัตถุดิบ อุปกรณ์) ออกนอกร้านโดยไม่ได้รับอนุญาต',
  ]},
  { title: '10. ความสะอาด', items: [
    'พนักงานต้องตัดเล็บให้สั้นอยู่เสมอ ห้ามไว้เล็บยาวและห้ามติดเล็บปลอม เพื่อความสะอาดและความปลอดภัยในการปฏิบัติงานกับอาหาร',
    'พนักงานที่มีผมยาวต้องมัดผมให้เรียบร้อยตลอดเวลาปฏิบัติงาน เพื่อป้องกันเส้นผมหล่นปนเปื้อนในอาหารของลูกค้า',
    'ล้างมือก่อนเริ่มงานและหลังเข้าห้องน้ำ',
  ]},
  { title: '11. มาตรฐานการทำอาหาร', items: [
    'การทำเมนูทุกครั้งต้องใช้แก้วตวงและช้อนตวงตามสูตรที่กำหนดเท่านั้น ห้ามกะปริมาณเอง แต่ต้องยึดตามสูตรเป็นหลัก',
    'ห้ามเปลี่ยนแปลงสูตรหรือส่วนผสมเองโดยไม่ได้รับอนุญาตจากเจ้าของร้าน',
    'ล้างผัก เนื้อสัตว์ และวัตถุดิบทุกชนิดให้สะอาดก่อนนำมาปรุง',
    'แยกเขียง/มีด สำหรับของดิบและของสุกอย่างชัดเจน ห้ามใช้ปนกัน',
    'การจัดเก็บวัตถุดิบ (แยกดิบ-สุก, วันหมดอายุ)',
  ]},
];

// ============================================================
// State
// ============================================================

const state = {
  user: null, // { id, name, role, employmentType }
  view: 'home',
  staff: [],
  attendance: [],
  warehouseItems: [],
  warehouseLogs: [],
  routines: [],
  routineInspections: [],
  notifications: [], // live-synced, capped to the most recent NOTIFICATIONS_PAGE_SIZE
  notificationsOlder: [], // manually paged-in via "โหลดเพิ่มเติม", one-time fetches
  notificationsExhausted: false,
  notificationsLoadingMore: false,
  holidays: [],
  fixedCosts: {}, // { [yyyy-mm]: { rent, water, electricity } } — admin+ only
  managerPay: {}, // { [staffId]: monthlySalary } — admin+ only
  ruleAcknowledgments: [], // one doc per staff id: { version, acknowledgedAt }
  scheduleMonth: currentYYYYMM(),
  financialMonth: currentYYYYMM(),
  categoryOpen: {},
  attendancePanelOpen: false,
  restockExpanded: false,
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

function formatDateDMY(ts) {
  if (!ts) return '';
  const d = ts.toMillis ? new Date(ts.toMillis()) : new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
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
  return rec || { staffId, date, dayOff: false, lateMinutes: 0, clockIn: null, clockOut: null };
}

function isHoliday(dateStr) {
  return state.holidays.some((h) => h.date === dateStr);
}

function isWeekendDate(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return day === 0 || day === 6;
}

function getShift(dateStr) {
  return isWeekendDate(dateStr) ? WEEKEND_SHIFT : WEEKDAY_SHIFT;
}

function getShiftText(dateStr) {
  const shift = getShift(dateStr);
  return `${shift.start}-${shift.end}`;
}

// Full shift span minus the unpaid break — 11 hours for both the weekday
// (10:00-22:00) and weekend (09:00-21:00) schedules.
function getScheduledHours(dateStr) {
  const shift = getShift(dateStr);
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60 - BREAK_HOURS;
}

// A day's pay: ฿40/hour actually worked (a full day is 11 hours), ×1.5 on
// a holiday, +฿50 food allowance when hoursWorked exceeds 10. Being late
// simply reduces hours worked.
function computePay(staffId, dateStr) {
  const att = getAttendance(staffId, dateStr);
  if (att.dayOff) return 0;
  const scheduledHours = getScheduledHours(dateStr);
  const lateHours = (att.lateMinutes || 0) / 60;
  const hoursWorked = Math.max(0, scheduledHours - lateHours);
  let pay = hoursWorked * HOURLY_RATE;
  if (isHoliday(dateStr)) pay *= 1.5;
  if (hoursWorked > FOOD_ALLOWANCE_MIN_HOURS) pay += FOOD_ALLOWANCE;
  return Math.round(pay);
}

// Managers are on a flat monthly salary instead of the hourly formula
// above. The base salary is paid in full regardless of days off; on top
// of it, each day actually worked adds a flat ฿50 food allowance plus a
// "1hr OT" bonus (her personal hourly-equivalent rate = salary/30/10).
// On a holiday, that OT bonus is replaced by a full day (11h) at her
// hourly-equivalent rate, ×1.5 — not just the usual +50/+OT combo.
function computeManagerDayExtra(monthlySalary, dateStr, dayOff) {
  if (dayOff || monthlySalary == null) return 0;
  const hourlyEquivalent = monthlySalary / 30 / 10;
  if (isHoliday(dateStr)) return hourlyEquivalent * 11 * 1.5;
  return FOOD_ALLOWANCE + hourlyEquivalent;
}

async function saveAttendanceException(staffId, date, patch) {
  const id = `${staffId}_${date}`;
  const current = getAttendance(staffId, date);
  const merged = { ...current, ...patch, staffId, date };
  const isDefault = !merged.dayOff && !(merged.lateMinutes > 0) && !merged.clockIn && !merged.clockOut;
  if (isDefault) {
    await DB.deleteDoc('attendance', id).catch(() => {});
  } else {
    await DB.setDoc('attendance', id, merged, false);
  }
}

// How strongly each newer usage event outweighs the accumulated history in
// the exponentially-weighted average below. Higher = reacts faster to
// recent changes; lower = smoother but slower to notice a shift.
const USAGE_EWMA_ALPHA = 0.35;
const USAGE_TREND_THRESHOLD = 0.15; // ±15% vs the flat average counts as a trend

function daysBetweenDateStrs(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

// Collapses an item's raw update logs into one quantity reading per
// calendar day (that day's LATEST update) — if quantity was corrected
// several times in one day, only the final value counts, so those
// corrections don't get double-counted as separate usage events.
function dailyQuantitySnapshots(item) {
  const logs = state.warehouseLogs
    .filter((l) => l.itemId === item.id)
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  const byDate = new Map(); // dateStr -> latest qty that day (later logs overwrite earlier ones)
  logs.forEach((l) => byDate.set(dateStrOf(l.createdAt), l.newQty));
  return [...byDate.entries()]
    .map(([date, qty]) => ({ date, qty }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Usage is derived only from day-to-day drops in that daily snapshot
// (restocking doesn't read as negative usage). Each drop implies a daily
// rate (units used / calendar days between the two snapshot days); those
// per-drop rates are combined with an exponentially-weighted moving
// average (EWMA) so recent usage counts more than old usage, instead of
// one flat average across all-time history. A flat (unweighted) average
// is also computed as a baseline to detect whether usage is trending up
// or down relative to it.
function restockInfo(item) {
  const snapshots = dailyQuantitySnapshots(item);
  if (snapshots.length < 2) return { daysRemaining: null, avgDailyUsage: null, trend: null, level: 'ok', text: 'ยังไม่มีข้อมูลเพียงพอ' };

  let ewma = null;
  let totalDecrease = 0;
  let sawDecrease = false;
  for (let i = 1; i < snapshots.length; i++) {
    const delta = snapshots[i].qty - snapshots[i - 1].qty;
    if (delta >= 0) continue; // restocks/no-change days don't count as usage
    sawDecrease = true;
    const gapDays = Math.max(1, daysBetweenDateStrs(snapshots[i - 1].date, snapshots[i].date));
    const eventRate = Math.abs(delta) / gapDays;
    ewma = ewma == null ? eventRate : USAGE_EWMA_ALPHA * eventRate + (1 - USAGE_EWMA_ALPHA) * ewma;
    totalDecrease += Math.abs(delta);
  }
  if (!sawDecrease || !ewma || ewma <= 0) return { daysRemaining: null, avgDailyUsage: null, trend: null, level: 'ok', text: 'ยังไม่มีข้อมูลเพียงพอ' };

  const flatDays = Math.max(1, daysBetweenDateStrs(snapshots[0].date, snapshots[snapshots.length - 1].date));
  const flatAvg = totalDecrease / flatDays;

  const daysRemaining = item.quantity / ewma;
  const level = daysRemaining < 3 ? 'low' : daysRemaining < 7 ? 'medium' : 'ok';
  const trend = flatAvg <= 0 ? 'flat'
    : ewma / flatAvg > 1 + USAGE_TREND_THRESHOLD ? 'up'
    : ewma / flatAvg < 1 - USAGE_TREND_THRESHOLD ? 'down'
    : 'flat';
  return { daysRemaining, avgDailyUsage: ewma, trend, level, text: `เหลือประมาณ ${daysRemaining.toFixed(1)} วัน` };
}

function addDaysToDateStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  if (state.view === 'analytics' && !roleAtLeast(state.user.role, 'manager')) {
    state.view = 'home';
  }

  document.getElementById('sidebar-nav').innerHTML = renderSidebarNav();

  const view = document.getElementById('view');
  switch (state.view) {
    case 'home': view.innerHTML = renderHome(); break;
    case 'timesheet': view.innerHTML = renderTimesheet(); break;
    case 'warehouse': view.innerHTML = renderWarehouse(); break;
    case 'analytics': view.innerHTML = renderAnalytics(); break;
    case 'checklist': view.innerHTML = renderChecklist(); break;
    case 'rules': view.innerHTML = renderRules(); break;
    case 'admin': view.innerHTML = renderAdmin(); break;
    case 'financial': view.innerHTML = renderFinancial(); break;
    case 'notifications': view.innerHTML = renderNotifications(); break;
    default: view.innerHTML = renderHome();
  }

  updateTopbarUserInfo();

  if (state.view === 'timesheet') {
    requestAnimationFrame(fitScheduleGrid);
  }
}

// Shrinks the whole schedule table (via CSS transform) so every column
// fits on screen at once instead of requiring a sideways scroll. The
// table renders at its natural content width first, then gets scaled
// down uniformly — same idea as "zoom to fit" in a spreadsheet.
function fitScheduleGrid() {
  const wrap = document.querySelector('.schedule-scroll');
  const table = wrap && wrap.querySelector('.schedule-grid');
  if (!wrap || !table) return;

  table.style.transform = 'none';
  wrap.style.height = '';

  const wrapWidth = wrap.clientWidth;
  const naturalWidth = table.scrollWidth;
  const naturalHeight = table.scrollHeight;
  if (!wrapWidth || !naturalWidth) return;

  const scale = Math.min(1, wrapWidth / naturalWidth);
  table.style.transformOrigin = 'top left';
  table.style.transform = `scale(${scale})`;
  wrap.style.height = `${Math.ceil(naturalHeight * scale)}px`;
}

window.addEventListener('resize', () => {
  if (state.view === 'timesheet') fitScheduleGrid();
});

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
  // Same exclusion as ลงเวลา/การเงิน — Admins/Owner aren't hourly scheduled staff.
  const activeStaff = state.staff.filter((s) => s.active !== false && (s.role === 'employee' || s.role === 'manager'));
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
            ${att.lateMinutes ? `<span class="badge badge-danger">สาย ${att.lateMinutes} นาที</span>` : ''}
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-sm ${att.dayOff ? 'btn-outline' : 'btn-ghost'}" data-action="quick-toggle-dayoff" data-staff="${s.id}" data-date="${today}">ลา</button>
          <button class="btn btn-sm btn-outline" data-action="open-schedule-cell-modal" data-staff="${s.id}" data-date="${today}">แก้ไข</button>
          ${canManageStaffMember(s) ? `<button class="btn btn-sm btn-ghost" data-action="delete-staff" data-id="${s.id}">ลบ</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="screen-header">
      <div><h2>ลงเวลา</h2><div class="sub">จัดการเวลาเข้างานและตารางเดือน</div></div>
      <button class="btn btn-primary" data-action="open-add-staff-modal">+ เพิ่มพนักงาน</button>
    </div>
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
      const shift = getShift(date);
      const shiftText = (att.clockIn || att.clockOut) ? `${att.clockIn || shift.start}-${att.clockOut || shift.end}` : getShiftText(date);
      let cls = 'present', label = shiftText;
      if (att.dayOff) {
        cls = 'dayoff'; label = 'หยุด';
      } else if (att.lateMinutes > 0) {
        cls = 'late';
      }
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
      ${renderScheduleSummary(staffList, ym)}
    </div>
  `;
}

function renderScheduleSummary(staffList, ym) {
  const dates = monthDates(ym);
  const rows = staffList.map((s) => {
    let daysWorked = 0, daysOff = 0, daysLate = 0, totalHours = 0;
    dates.forEach((date) => {
      const att = getAttendance(s.id, date);
      if (att.dayOff) {
        daysOff++;
      } else {
        daysWorked++;
        if (att.lateMinutes > 0) daysLate++;
        totalHours += Math.max(0, getScheduledHours(date) - (att.lateMinutes || 0) / 60);
      }
    });
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${daysWorked}</td>
      <td>${daysOff}</td>
      <td>${daysLate}</td>
      <td>${totalHours.toFixed(1)}</td>
    </tr>`;
  }).join('');

  return `
    <div style="overflow-x:auto;margin-top:16px">
      <h3 style="margin:0 0 8px">สรุปประจำเดือน</h3>
      <table class="table-simple">
        <thead><tr><th>ชื่อ</th><th>วันทำงาน</th><th>วันหยุด</th><th>มาสาย (วัน)</th><th>ชั่วโมงรวม</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">ไม่มีพนักงาน</td></tr>'}</tbody>
      </table>
    </div>`;
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${state.warehouseItems.length ? `<button class="btn btn-outline" data-action="export-inventory-csv">⬇ ส่งออก Excel</button>` : ''}
        ${canEdit ? `<button class="btn btn-primary" data-action="open-add-warehouse-modal">+ เพิ่มรายการ</button>` : ''}
      </div>
    </div>
    ${restockList.length ? `
    <div class="card">
      <h3>ควรสั่งเพิ่มเร็วๆ นี้</h3>
      ${(state.restockExpanded ? restockList : restockList.slice(0, 3)).map((x) => `
        <div class="list-row">
          <div class="info">
            <div class="title">${escapeHtml(x.item.name)}</div>
            <div class="restock-flag ${x.info.level}">${escapeHtml(x.info.text)}</div>
          </div>
          <div class="badge badge-${x.info.level === 'low' ? 'danger' : 'warning'}">${x.info.level === 'low' ? 'ด่วน' : 'เฝ้าระวัง'}</div>
        </div>`).join('')}
      ${restockList.length > 3 ? `
        <button class="btn btn-sm btn-outline btn-block" data-action="toggle-restock-list" style="margin-top:8px">
          ${state.restockExpanded ? '▴ ย่อ' : `▾ ดูเพิ่มเติม (${restockList.length - 3})`}
        </button>` : ''}
    </div>` : ''}
    ${catNames.length ? catNames.map((cat) => renderWarehouseCategory(cat, categories[cat], canEdit)).join('') : '<div class="empty-state">ยังไม่มีรายการในคลัง</div>'}
  `;
}

function renderWarehouseCategory(cat, items, canEdit) {
  const open = !!state.categoryOpen[cat];
  return `
    <div class="category ${open ? 'open' : ''}">
      <div class="category-header">
        <span data-action="toggle-category" data-cat="${escapeHtml(cat)}" style="flex:1;cursor:pointer">${escapeHtml(cat)} (${items.length}) <span class="chevron">▸</span></span>
        ${canEdit ? `<button class="btn btn-sm btn-ghost btn-icon" title="แก้ไขชื่อหมวดหมู่" data-action="open-rename-category-modal" data-cat="${escapeHtml(cat)}">✎</button>` : ''}
      </div>
      <div class="category-body">${items.map((item) => renderWarehouseItem(item, canEdit)).join('')}</div>
    </div>`;
}

function renderWarehouseItem(item, canEdit) {
  const info = restockInfo(item);
  return `
    <div class="warehouse-item">
      <div class="warehouse-item-main">
        ${item.photo ? `<img class="thumb" src="${item.photo}" alt="${escapeHtml(item.name)}" />` : `<div class="thumb placeholder">📦</div>`}
        <div class="info">
          <div class="title">${escapeHtml(item.name)}${item.updatedAt ? ` <span class="update-date">${formatDateDMY(item.updatedAt)}</span>` : ''}</div>
          <div class="meta">${item.quantity} ${escapeHtml(item.unit || 'หน่วย')}</div>
          ${info.daysRemaining != null ? `<div class="restock-flag ${info.level}">เหลือ ~${info.daysRemaining.toFixed(1)} วัน</div>` : ''}
        </div>
      </div>
      ${canEdit ? `
        <div class="warehouse-item-actions">
          <div class="qty-controls">
            <input type="number" id="wh-qty-input-${item.id}" value="${item.quantity}" min="0" />
            <button class="btn btn-sm btn-primary" data-action="wh-qty-update" data-id="${item.id}">อัพเดท</button>
          </div>
          <label class="btn btn-sm btn-outline btn-icon" title="เปลี่ยนรูป">📷
            <input type="file" accept="image/*" capture="environment" data-action="wh-photo-select" data-id="${item.id}" style="display:none" />
          </label>
          <button class="btn btn-sm btn-ghost btn-icon" data-action="delete-warehouse-item" data-id="${item.id}">🗑</button>
        </div>
      ` : ''}
    </div>`;
}

// ============================================================
// Render: Warehouse analytics
// ============================================================

function renderAnalytics() {
  const rows = state.warehouseItems
    .map((item) => ({ item, info: restockInfo(item) }))
    .sort((a, b) => (a.info.daysRemaining ?? Infinity) - (b.info.daysRemaining ?? Infinity));

  return `
    <div class="screen-header">
      <div><h2>วิเคราะห์คลังสินค้า</h2><div class="sub">อัตราการใช้เฉลี่ยและวันที่คาดว่าสินค้าจะหมด</div></div>
      ${rows.length ? `<button class="btn btn-outline" data-action="export-warehouse-csv">⬇ ส่งออก CSV</button>` : ''}
    </div>
    <div class="card">
      ${rows.length ? rows.map(({ item, info }) => renderAnalyticsRow(item, info)).join('') : '<div class="empty-state">ยังไม่มีรายการในคลัง</div>'}
    </div>
  `;
}

const TREND_LABEL = { up: '▲ ใช้เร็วขึ้น', down: '▼ ใช้ช้าลง', flat: '▪ คงที่' };
const TREND_BADGE = { up: 'danger', down: 'success', flat: 'muted' };

function renderAnalyticsRow(item, info) {
  const statusLabel = info.level === 'low' ? 'ด่วน' : info.level === 'medium' ? 'เฝ้าระวัง' : info.daysRemaining != null ? 'ปกติ' : 'ไม่มีข้อมูล';
  const statusBadge = info.level === 'low' ? 'danger' : info.level === 'medium' ? 'warning' : info.daysRemaining != null ? 'success' : 'muted';
  const unit = escapeHtml(item.unit || 'หน่วย');
  const runOutLine = info.daysRemaining != null
    ? `คาดว่าจะหมดวันที่ <strong>${formatDateThai(addDaysToDateStr(todayStr(), Math.round(info.daysRemaining)))}</strong> (~${info.daysRemaining.toFixed(1)} วัน)`
    : 'ยังไม่มีข้อมูลเพียงพอสำหรับคาดการณ์';

  return `
    <div class="list-row">
      <div class="info">
        <div class="title">${escapeHtml(item.name)} <span class="tag-pill">${escapeHtml(item.category || '')}</span></div>
        <div class="meta">คงเหลือ ${item.quantity} ${unit}${info.avgDailyUsage ? ` · ใช้เฉลี่ย ${info.avgDailyUsage.toFixed(1)} ${unit}/วัน` : ''}</div>
        <div class="meta">${runOutLine}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="badge badge-${statusBadge}">${statusLabel}</span>
        ${info.trend ? `<span class="badge badge-${TREND_BADGE[info.trend]}">${TREND_LABEL[info.trend]}</span>` : ''}
      </div>
    </div>`;
}

// ============================================================
// CSV export (warehouse analysis + full daily quantity history)
// ============================================================

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDateStrDMY(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// Plain current-stock snapshot for the คลังสินค้า page — one row per
// item as it stands right now, not history or usage-rate analysis
// (that richer export lives on วิเคราะห์คลังสินค้า, see below).
function exportInventoryCsv() {
  const items = [...state.warehouseItems].sort((a, b) => (a.category || '').localeCompare(b.category || '', 'th') || a.name.localeCompare(b.name, 'th'));
  const rows = [
    ['ชื่อรายการ', 'หมวดหมู่', 'จำนวนคงเหลือ', 'หน่วย', 'อัปเดตล่าสุด'],
    ...items.map((item) => [item.name, item.category || '', item.quantity, item.unit || '', item.updatedAt ? formatDateDMY(item.updatedAt) : '']),
  ];
  downloadCsv(`malatang-inventory-${todayStr()}.csv`, rows);
}

// Two tables in one CSV: (1) current analysis — usage rate, trend,
// predicted run-out — one row per existing item; (2) the full daily
// quantity history pivoted wide (one row per item, one column per date
// that had any update), reusing the same daily-snapshot logic that
// feeds restockInfo(). Items that were later deleted still have their
// warehouseLogs history, so they're included in table 2 (labelled
// "ลบแล้ว") instead of being silently dropped.
function exportWarehouseHistoryCsv() {
  const items = [...state.warehouseItems].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const knownIds = new Set(items.map((i) => i.id));

  const summaryHeader = ['ชื่อรายการ', 'หมวดหมู่', 'หน่วย', 'คงเหลือปัจจุบัน', 'อัตราการใช้เฉลี่ย/วัน', 'แนวโน้ม', 'เหลืออีกกี่วัน', 'คาดว่าจะหมดวันที่'];
  const trendText = { up: 'ใช้เร็วขึ้น', down: 'ใช้ช้าลง', flat: 'คงที่' };
  const summaryRows = items.map((item) => {
    const info = restockInfo(item);
    return [
      item.name,
      item.category || '',
      item.unit || '',
      item.quantity,
      info.avgDailyUsage != null ? info.avgDailyUsage.toFixed(2) : '',
      info.trend ? trendText[info.trend] : '',
      info.daysRemaining != null ? info.daysRemaining.toFixed(1) : '',
      info.daysRemaining != null ? formatDateStrDMY(addDaysToDateStr(todayStr(), Math.round(info.daysRemaining))) : '',
    ];
  });

  const orphanIds = [...new Set(state.warehouseLogs.map((l) => l.itemId))].filter((id) => !knownIds.has(id));
  const historyEntities = [
    ...items.map((i) => ({ id: i.id, name: i.name, category: i.category || '' })),
    ...orphanIds.map((id) => {
      const anyLog = state.warehouseLogs.find((l) => l.itemId === id);
      return { id, name: `${anyLog ? anyLog.itemName : id} (ลบแล้ว)`, category: '' };
    }),
  ];

  const dateSet = new Set();
  const perEntitySnapshots = new Map(); // id -> Map(date -> qty)
  historyEntities.forEach((entity) => {
    const snaps = dailyQuantitySnapshots({ id: entity.id });
    const map = new Map();
    snaps.forEach((s) => { map.set(s.date, s.qty); dateSet.add(s.date); });
    perEntitySnapshots.set(entity.id, map);
  });
  const sortedDates = [...dateSet].sort();
  const historyHeader = ['ชื่อรายการ', 'หมวดหมู่', ...sortedDates.map(formatDateStrDMY)];
  const historyRows = historyEntities.map((entity) => {
    const map = perEntitySnapshots.get(entity.id);
    return [entity.name, entity.category, ...sortedDates.map((d) => (map.has(d) ? map.get(d) : ''))];
  });

  downloadCsv(`malatang-warehouse-analysis-${todayStr()}.csv`, [
    ['สรุปการวิเคราะห์คลังสินค้า'],
    summaryHeader,
    ...summaryRows,
    [],
    ['ประวัติจำนวนคงเหลือรายวัน (รายการ x วันที่)'],
    historyHeader,
    ...historyRows,
  ]);
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
// Render: Work rules
// ============================================================

function renderRules() {
  const myAck = state.ruleAcknowledgments.find((a) => a.id === state.user.id);
  const acknowledged = myAck && myAck.version === WORK_RULES_VERSION;

  const sectionsHtml = WORK_RULES_SECTIONS.map((sec) => `
    <div style="margin-bottom:20px">
      <h3 style="color:var(--color-primary-dark);margin:0 0 8px">${escapeHtml(sec.title)}</h3>
      <ul style="margin:0;padding-left:20px;line-height:1.7">
        ${sec.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </div>`).join('');

  const ackBlock = acknowledged ? `
    <div class="card" style="background:#d9f0e1;border:1px solid var(--color-success)">
      <strong style="color:var(--color-success)">✅ คุณรับทราบกฎระเบียบฉบับนี้แล้ว</strong>
      <div class="sub" style="margin-top:4px">เมื่อ ${formatDateTimeThai(myAck.acknowledgedAt)}</div>
    </div>` : `
    <div class="card">
      <label style="display:flex;align-items:flex-start;gap:10px;font-weight:400">
        <input type="checkbox" data-action="toggle-rules-ack-button" style="width:20px;height:20px;margin-top:2px;flex-shrink:0" />
        <span>ฉันได้อ่านและเข้าใจกฎระเบียบการทำงานข้างต้นแล้ว และยินยอมปฏิบัติตาม</span>
      </label>
      <button class="btn btn-primary btn-block" style="margin-top:12px" data-action="acknowledge-rules" id="rules-ack-btn" disabled>รับทราบกฎระเบียบ</button>
    </div>`;

  return `
    <div class="screen-header"><div><h2>กฎระเบียบการทำงาน</h2><div class="sub">ร้านหมาล่าทั่ง สาขาระยอง</div></div></div>
    ${ackBlock}
    <div class="card">${sectionsHtml}</div>
    ${isManager() ? renderRulesCompliance() : ''}
  `;
}

function renderRulesCompliance() {
  const staffList = state.staff.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const rows = staffList.map((s) => {
    const ack = state.ruleAcknowledgments.find((a) => a.id === s.id);
    const done = ack && ack.version === WORK_RULES_VERSION;
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${done ? '<span class="badge badge-success">รับทราบแล้ว</span>' : '<span class="badge badge-danger">ยังไม่รับทราบ</span>'}</td>
      <td>${done ? formatDateThai(dateStrOf(ack.acknowledgedAt)) : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="card">
      <h3>สถานะการรับทราบของพนักงาน</h3>
      <div style="overflow-x:auto">
        <table class="table-simple">
          <thead><tr><th>ชื่อ</th><th>สถานะ</th><th>วันที่รับทราบ</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="3">ไม่มีพนักงาน</td></tr>'}</tbody>
        </table>
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
  // Only hourly (scheduled/clocked) staff are paid this way — Admins/Owner
  // aren't hourly employees, same exclusion as the Timesheet page.
  const payStaff = state.staff
    .filter((s) => s.active !== false && (s.role === 'employee' || s.role === 'manager'))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const dates = monthDates(ym);

  let payrollTotal = 0;
  const rows = payStaff.map((s) => {
    let daysWorked = 0, totalHours = 0, totalPay = 0;

    if (s.role === 'manager') {
      const monthlySalary = state.managerPay[s.id];
      let daysOff = 0;
      dates.forEach((d) => {
        const att = getAttendance(s.id, d);
        if (att.dayOff) {
          daysOff++;
        } else {
          daysWorked++;
          totalPay += computeManagerDayExtra(monthlySalary, d, false);
        }
      });
      const diligenceBonus = daysOff <= MANAGER_DILIGENCE_MAX_DAYS_OFF ? MANAGER_DILIGENCE_BONUS : 0;
      totalPay = monthlySalary == null ? 0 : Math.round((monthlySalary || 0) + totalPay + diligenceBonus);
      payrollTotal += totalPay;
      return `<tr>
        <td>${escapeHtml(s.name)} <span class="tag-pill">เงินเดือน</span></td>
        <td>${daysWorked} วัน</td>
        <td>—</td>
        <td>${monthlySalary == null ? '<span class="badge badge-warning">ยังไม่ได้ตั้งเงินเดือน</span>' : formatBaht(totalPay)}</td>
      </tr>`;
    }

    dates.forEach((d) => {
      const att = getAttendance(s.id, d);
      if (!att.dayOff) {
        daysWorked++;
        totalHours += Math.max(0, getScheduledHours(d) - (att.lateMinutes || 0) / 60);
      }
      totalPay += computePay(s.id, d);
    });
    payrollTotal += totalPay;
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${daysWorked} วัน</td>
      <td>${totalHours.toFixed(1)} ชม.</td>
      <td>${formatBaht(totalPay)}</td>
    </tr>`;
  }).join('');

  const holidaysSorted = [...state.holidays].sort((a, b) => a.date.localeCompare(b.date));

  const fc = state.fixedCosts[ym] || {};
  const rent = Number(fc.rent) || 0;
  const water = Number(fc.water) || 0;
  const electricity = Number(fc.electricity) || 0;
  const fixedTotal = rent + water + electricity;

  return `
    <div class="screen-header">
      <div><h2>การเงิน</h2><div class="sub">สรุปเงินเดือนพนักงานรายเดือน</div></div>
      <div class="month-picker"><input type="month" value="${ym}" data-action="change-financial-month" /></div>
    </div>
    <div class="card">
      <h3>เงินเดือนโดยประมาณ — ${monthLabelThai(ym)}</h3>
      <p class="sub" style="margin-top:-4px">
        พนักงานทั่วไป: ฿${HOURLY_RATE}/ชม. · วันทำงานปกติ 11 ชม. = ฿${HOURLY_RATE * 11} · +฿${FOOD_ALLOWANCE} ค่าอาหารถ้าทำงานเกิน ${FOOD_ALLOWANCE_MIN_HOURS} ชม. · ×1.5 วันหยุดนักขัตฤกษ์<br>
        ผู้จัดการ: เงินเดือนประจำ (ไม่หักแม้ลา) + ฿${FOOD_ALLOWANCE} ค่าอาหาร + OT 1 ชม. (เงินเดือน/30/10) ทุกวันที่มาทำงาน · วันหยุดพิเศษได้ OT เต็มวัน (11 ชม.) ×1.5 · +฿${MANAGER_DILIGENCE_BONUS} เบี้ยขยัน/เดือน ถ้าลาไม่เกิน ${MANAGER_DILIGENCE_MAX_DAYS_OFF} วัน
      </p>
      <div style="overflow-x:auto">
        <table class="table-simple">
          <thead><tr><th>ชื่อ</th><th>วันทำงาน</th><th>ชั่วโมงรวม</th><th>รวมประมาณการ</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">ยังไม่มีพนักงาน</td></tr>'}</tbody>
          ${rows ? `<tfoot><tr><td colspan="3" style="font-weight:700">รวมเงินเดือนทั้งหมด</td><td style="font-weight:700">${formatBaht(payrollTotal)}</td></tr></tfoot>` : ''}
        </table>
      </div>
    </div>
    <div class="card">
      <h3>ต้นทุนคงที่โดยประมาณ — ${monthLabelThai(ym)}</h3>
      <p class="sub" style="margin-top:-4px">กรอกค่าเช่าและค่าสาธารณูปโภคของเดือนนี้ เพื่อประเมินต้นทุนคงที่รวม</p>
      <form data-form="save-fixed-costs" class="form-row" style="align-items:flex-end">
        <div class="field"><label>ค่าเช่า (บาท)</label><input type="number" name="rent" min="0" value="${rent || ''}" /></div>
        <div class="field"><label>ค่าน้ำ (บาท)</label><input type="number" name="water" min="0" value="${water || ''}" /></div>
        <div class="field"><label>ค่าไฟ (บาท)</label><input type="number" name="electricity" min="0" value="${electricity || ''}" /></div>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </form>
      <table class="table-simple" style="margin-top:12px">
        <tbody>
          <tr><td>รวมต้นทุนคงที่ (ค่าเช่า+ค่าน้ำ+ค่าไฟ)</td><td style="font-weight:700">${formatBaht(fixedTotal)}</td></tr>
          <tr><td style="font-weight:700">รวมต้นทุนทั้งหมด (เงินเดือน+ต้นทุนคงที่)</td><td style="font-weight:700">${formatBaht(payrollTotal + fixedTotal)}</td></tr>
        </tbody>
      </table>
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
  const items = [...state.notifications, ...state.notificationsOlder].sort(byCreatedAtDesc);
  return `
    <div class="screen-header"><div><h2>แจ้งเตือน</h2><div class="sub">กิจกรรมทั้งหมดในระบบ</div></div></div>
    <div class="card">
      ${items.length ? items.map(renderNotificationItem).join('') : '<div class="empty-state">ยังไม่มีการแจ้งเตือน</div>'}
      ${!state.notificationsExhausted && items.length > 0 ? `
        <button class="btn btn-outline btn-block" style="margin-top:12px" data-action="load-more-notifications" ${state.notificationsLoadingMore ? 'disabled' : ''}>
          ${state.notificationsLoadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่มเติม'}
        </button>` : ''}
    </div>
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
          <select name="role" ${isAdmin() ? 'data-action="staff-role-toggle"' : ''}>${roleOptions.map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select>
        </div>
        <div class="field"><label>ประเภทการจ้าง</label>
          <select name="employmentType"><option value="full-time">เต็มเวลา</option><option value="part-time">พาร์ทไทม์</option></select>
        </div>
      </div>
      ${isAdmin() ? `
        <div class="field" id="staff-monthly-salary-field" style="display:none">
          <label>เงินเดือนประจำ (บาท) — สำหรับผู้จัดการเท่านั้น</label>
          <input type="number" name="monthlySalary" min="0" />
        </div>` : ''}
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
  const roleChoices = ['employee', 'manager', 'admin'].concat(s.role === 'owner' ? ['owner'] : []);
  openModal(`
    <div class="modal-header"><h3>แก้ไขพนักงาน</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="edit-staff" data-id="${s.id}">
      <div class="field"><label>ชื่อ</label><input type="text" name="name" value="${escapeHtml(s.name)}" required /></div>
      <div class="form-row">
        <div class="field"><label>ตำแหน่ง</label>
          <select name="role" ${canChangeRole ? (isAdmin() ? 'data-action="staff-role-toggle"' : '') : 'disabled'}>
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
      ${isAdmin() ? `
        <div class="field" id="staff-monthly-salary-field" style="display:${s.role === 'manager' ? 'block' : 'none'}">
          <label>เงินเดือนประจำ (บาท) — สำหรับผู้จัดการเท่านั้น</label>
          <input type="number" name="monthlySalary" min="0" value="${state.managerPay[s.id] != null ? state.managerPay[s.id] : ''}" />
        </div>` : ''}
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

function getWarehouseCategories() {
  return [...new Set(state.warehouseItems.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
}

function openAddWarehouseModal() {
  const categories = getWarehouseCategories();
  openModal(`
    <div class="modal-header"><h3>เพิ่มรายการคลังสินค้า</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="add-warehouse-item">
      <div class="field"><label>ชื่อรายการ</label><input type="text" name="name" required /></div>
      <div class="form-row">
        <div class="field">
          <label>หมวดหมู่</label>
          <select name="categorySelect" data-action="wh-category-toggle">
            ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            <option value="__new__">+ หมวดหมู่ใหม่...</option>
          </select>
        </div>
        <div class="field"><label>หน่วย</label><input type="text" name="unit" placeholder="เช่น กก., ถุง" required /></div>
      </div>
      <div class="field" id="wh-category-new-field" style="${categories.length ? 'display:none' : ''}">
        <label>ชื่อหมวดหมู่ใหม่</label>
        <input type="text" name="categoryNew" placeholder="เช่น เนื้อสัตว์" ${categories.length ? '' : 'required'} />
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

function openRenameCategoryModal(oldCat) {
  openModal(`
    <div class="modal-header"><h3>แก้ไขชื่อหมวดหมู่</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="rename-category" data-old-cat="${escapeHtml(oldCat)}">
      <div class="field"><label>ชื่อหมวดหมู่</label><input type="text" name="newCat" value="${escapeHtml(oldCat)}" required /></div>
      <p class="sub" style="margin-top:-4px">จะเปลี่ยนชื่อหมวดหมู่นี้ให้ทุกรายการที่อยู่ในหมวด "${escapeHtml(oldCat)}"</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึก</button>
      </div>
    </form>
  `);
}

function subtaskRowHtml(text = '', requiresPhoto = false) {
  return `
    <div class="subtask-builder-row">
      <input type="text" class="subtask-text-input" value="${escapeHtml(text)}" placeholder="เช่น เช็ดโต๊ะ" />
      <label class="subtask-photo-check"><input type="checkbox" class="subtask-photo-checkbox" ${requiresPhoto ? 'checked' : ''} /> ต้องแนบรูป (สูงสุด 2 รูป)</label>
      <button type="button" class="btn btn-sm btn-ghost btn-icon" data-action="remove-subtask-row">✕</button>
    </div>`;
}

function openAddRoutineModal() {
  openModal(`
    <div class="modal-header"><h3>เพิ่มเช็คลิสต์</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="add-routine">
      <div class="field"><label>ชื่อเช็คลิสต์</label><input type="text" name="name" required /></div>
      <div class="field"><label>คำแนะนำ (ถ้ามี)</label><textarea name="instructions"></textarea></div>
      <div class="field">
        <label>รายการย่อย</label>
        <div id="subtask-rows">${subtaskRowHtml()}</div>
        <button type="button" class="btn btn-sm btn-outline" data-action="add-subtask-row" style="margin-top:8px">+ เพิ่มรายการย่อย</button>
      </div>
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

// Older routines stored subTasks as plain strings — normalize either shape.
function normalizeSubtask(t) {
  return typeof t === 'string' ? { text: t, requiresPhoto: false } : t;
}

function subtaskPhotoSlotHtml(index, slot) {
  const field = `subtask-${index}-photo-${slot}`;
  return `
    <div class="photo-slot">
      <input type="file" accept="image/*" capture="environment" data-photo-field="${field}" />
      <input type="hidden" name="${field}" />
      <img id="${field}-preview" class="photo-preview" style="display:none" />
    </div>`;
}

function openRoutineReportModal(routineId) {
  const routine = state.routines.find((r) => r.id === routineId);
  if (!routine) return;
  const subtasks = (routine.subTasks || []).map(normalizeSubtask);
  openModal(`
    <div class="modal-header"><h3>${escapeHtml(routine.name)}</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <form data-form="routine-report" data-routine-id="${routine.id}">
      ${subtasks.length
        ? subtasks.map((t, i) => `
          <div class="subtask-report-item">
            <label class="subtask-row"><input type="checkbox" name="subtask-${i}" /> <span>${escapeHtml(t.text)}</span>${t.requiresPhoto ? ' <span class="tag-pill">ต้องแนบรูป</span>' : ''}</label>
            ${t.requiresPhoto ? `
              <div class="photo-slot-row">
                ${subtaskPhotoSlotHtml(i, 0)}
                ${subtaskPhotoSlotHtml(i, 1)}
              </div>` : ''}
          </div>`).join('')
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
  const shift = getShift(date);
  openModal(`
    <div class="modal-header"><h3>${escapeHtml(staff.name)}</h3><button class="modal-close" data-action="close-modal">✕</button></div>
    <p class="sub" style="margin-top:-8px">${formatDateThai(date)} · กะปกติ ${shift.start}-${shift.end}</p>
    <form data-form="schedule-cell" data-staff="${staffId}" data-date="${date}">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400"><input type="checkbox" name="dayOff" style="width:20px;height:20px" ${att.dayOff ? 'checked' : ''} /> วันหยุด (ลา)</label>
      <div class="form-row" style="margin-top:12px">
        <div class="field"><label>เวลาเข้างานจริง</label><input type="time" name="clockIn" value="${att.clockIn || ''}" placeholder="${shift.start}" /></div>
        <div class="field"><label>เวลาออกงานจริง</label><input type="time" name="clockOut" value="${att.clockOut || ''}" placeholder="${shift.end}" /></div>
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
      case 'toggle-restock-list': state.restockExpanded = !state.restockExpanded; render(); return;

      case 'export-inventory-csv': {
        exportInventoryCsv();
        return;
      }

      case 'export-warehouse-csv': {
        if (!isManager()) return;
        exportWarehouseHistoryCsv();
        return;
      }

      case 'load-more-notifications': {
        if (state.notificationsLoadingMore || state.notificationsExhausted) return;
        state.notificationsLoadingMore = true;
        render();
        try {
          const loaded = [...state.notifications, ...state.notificationsOlder].sort(byCreatedAtDesc);
          const cursor = loaded.length ? loaded[loaded.length - 1].createdAt : null;
          const more = await DB.fetchPage('notifications', {
            orderByField: 'createdAt', limit: NOTIFICATIONS_PAGE_SIZE, startAfterValue: cursor,
          });
          state.notificationsOlder = [...state.notificationsOlder, ...more];
          if (more.length < NOTIFICATIONS_PAGE_SIZE) state.notificationsExhausted = true;
        } catch (err) {
          console.error(err);
          toast('โหลดข้อมูลเพิ่มเติมไม่สำเร็จ', 'error');
        } finally {
          state.notificationsLoadingMore = false;
          render();
        }
        return;
      }

      case 'wh-category-toggle': {
        const newField = document.getElementById('wh-category-new-field');
        const newInput = newField && newField.querySelector('input[name="categoryNew"]');
        if (newField) newField.style.display = el.value === '__new__' ? 'block' : 'none';
        if (newInput) newInput.required = el.value === '__new__';
        return;
      }

      case 'staff-role-toggle': {
        const salaryField = document.getElementById('staff-monthly-salary-field');
        if (salaryField) salaryField.style.display = el.value === 'manager' ? 'block' : 'none';
        return;
      }

      case 'toggle-rules-ack-button': {
        const btn = document.getElementById('rules-ack-btn');
        if (btn) btn.disabled = !el.checked;
        return;
      }
      case 'acknowledge-rules': {
        await DB.setDoc('ruleAcknowledgments', state.user.id, {
          version: WORK_RULES_VERSION, staffName: state.user.name, acknowledgedAt: DB.serverTimestamp(),
        });
        addNotification(`${state.user.name} รับทราบกฎระเบียบการทำงานแล้ว`);
        toast('บันทึกการรับทราบแล้ว', 'success');
        return;
      }

      case 'open-rename-category-modal': {
        if (!isManager()) return;
        openRenameCategoryModal(data.cat);
        return;
      }

      case 'change-schedule-month': state.scheduleMonth = el.value; render(); return;
      case 'change-financial-month': state.financialMonth = el.value; render(); return;

      case 'open-add-staff-modal': openAddStaffModal(); return;
      case 'open-edit-staff-modal': openEditStaffModal(data.id); return;
      case 'open-add-warehouse-modal': openAddWarehouseModal(); return;
      case 'open-add-routine-modal': openAddRoutineModal(); return;
      case 'open-routine-report-modal': openRoutineReportModal(data.id); return;
      case 'open-schedule-cell-modal': openScheduleCellModal(data.staff, data.date); return;

      case 'add-subtask-row': {
        const container = document.getElementById('subtask-rows');
        if (container) container.insertAdjacentHTML('beforeend', subtaskRowHtml());
        return;
      }
      case 'remove-subtask-row': {
        const container = document.getElementById('subtask-rows');
        const row = el.closest('.subtask-builder-row');
        if (row && container && container.children.length > 1) row.remove();
        return;
      }

      case 'quick-toggle-dayoff': {
        if (!isManager()) return;
        const att = getAttendance(data.staff, data.date);
        await saveAttendanceException(data.staff, data.date, { dayOff: !att.dayOff });
        return;
      }
      case 'reset-schedule-cell': {
        if (!isManager()) return;
        await saveAttendanceException(data.staff, data.date, { dayOff: false, clockIn: null, clockOut: null, lateMinutes: 0 });
        closeModal();
        toast('รีเซ็ตแล้ว', 'success');
        return;
      }

      case 'wh-qty-update': {
        if (!isManager()) return;
        const item = state.warehouseItems.find((i) => i.id === data.id);
        const input = document.getElementById(`wh-qty-input-${data.id}`);
        if (!item || !input) return;
        await applyWarehouseQtyChange(item, Math.max(0, Number(input.value) || 0));
        toast('อัปเดตจำนวนแล้ว', 'success');
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
  await DB.updateDoc('warehouseItems', item.id, { quantity: newQty, updatedAt: DB.serverTimestamp() });
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
        if (state.user.role === 'manager' && role !== 'employee') { toast('ผู้จัดการเพิ่มได้เฉพาะพนักงานทั่วไป', 'error'); return; }
        const { uid } = await DB.createStaffAuthAccount(staffName, pin);
        await DB.setDoc('staff', uid, { name: staffName, role, employmentType, active: true, createdAt: DB.serverTimestamp() });
        if (isAdmin() && role === 'manager') {
          const monthlySalary = Number(formData.get('monthlySalary')) || 0;
          await DB.setDoc('managerPay', uid, { monthlySalary });
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
        if (isAdmin() && role === 'manager' && formData.has('monthlySalary')) {
          const monthlySalary = Number(formData.get('monthlySalary')) || 0;
          await DB.setDoc('managerPay', id, { monthlySalary });
        }
        addNotification(`${state.user.name} แก้ไขข้อมูลพนักงาน: ${staffName}`);
        closeModal();
        toast('บันทึกแล้ว', 'success');
        return;
      }

      case 'add-warehouse-item': {
        if (!isManager()) return;
        const itemName = formData.get('name').trim();
        const categorySelect = formData.get('categorySelect');
        const category = categorySelect === '__new__' ? formData.get('categoryNew').trim() : categorySelect;
        if (!category) { toast('กรุณาระบุหมวดหมู่', 'error'); return; }
        const unit = formData.get('unit').trim();
        const quantity = Number(formData.get('quantity')) || 0;
        const photo = formData.get('photo') || null;
        const id = await DB.addDoc('warehouseItems', { name: itemName, category, unit, quantity, photo, createdAt: DB.serverTimestamp(), updatedAt: DB.serverTimestamp() });
        await DB.addDoc('warehouseLogs', { itemId: id, itemName, previousQty: 0, newQty: quantity, delta: quantity, staffName: state.user.name, createdAt: DB.serverTimestamp() });
        addNotification(`${state.user.name} เพิ่มรายการคลังสินค้า: ${itemName}`);
        closeModal();
        toast('เพิ่มรายการแล้ว', 'success');
        return;
      }

      case 'rename-category': {
        if (!isManager()) return;
        const oldCat = formEl.dataset.oldCat;
        const newCat = formData.get('newCat').trim();
        if (!newCat) { toast('กรุณาระบุชื่อหมวดหมู่', 'error'); return; }
        if (newCat === oldCat) { closeModal(); return; }
        const items = state.warehouseItems.filter((i) => i.category === oldCat);
        await Promise.all(items.map((i) => DB.updateDoc('warehouseItems', i.id, { category: newCat })));
        addNotification(`${state.user.name} เปลี่ยนชื่อหมวดหมู่ "${oldCat}" เป็น "${newCat}"`);
        closeModal();
        toast('แก้ไขชื่อหมวดหมู่แล้ว', 'success');
        return;
      }

      case 'add-routine': {
        if (!isManager()) return;
        const routineName = formData.get('name').trim();
        const instructions = formData.get('instructions').trim();
        const subTasks = Array.from(formEl.querySelectorAll('.subtask-builder-row'))
          .map((row) => ({
            text: row.querySelector('.subtask-text-input').value.trim(),
            requiresPhoto: row.querySelector('.subtask-photo-checkbox').checked,
          }))
          .filter((st) => st.text);
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
        const subtasks = (routine.subTasks || []).map(normalizeSubtask);
        for (let i = 0; i < subtasks.length; i++) {
          const t = subtasks[i];
          const checked = !!formData.get(`subtask-${i}`);
          if (t.requiresPhoto && checked && !formData.get(`subtask-${i}-photo-0`) && !formData.get(`subtask-${i}-photo-1`)) {
            toast(`กรุณาแนบรูปสำหรับ "${t.text}"`, 'error');
            return;
          }
        }
        const subTasksChecked = subtasks.map((t, i) => ({
          text: t.text,
          checked: !!formData.get(`subtask-${i}`),
          photos: t.requiresPhoto
            ? [formData.get(`subtask-${i}-photo-0`), formData.get(`subtask-${i}-photo-1`)].filter(Boolean)
            : [],
        }));
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
        const clockIn = formData.get('clockIn') || null;
        const clockOut = formData.get('clockOut') || null;
        const lateMinutes = Number(formData.get('lateMinutes')) || 0;
        await saveAttendanceException(staffId, date, { dayOff, clockIn, clockOut, lateMinutes });
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

      case 'save-fixed-costs': {
        if (!isAdmin()) return;
        const rent = Number(formData.get('rent')) || 0;
        const water = Number(formData.get('water')) || 0;
        const electricity = Number(formData.get('electricity')) || 0;
        await DB.setDoc('fixedCosts', state.financialMonth, { rent, water, electricity, updatedAt: DB.serverTimestamp() });
        toast('บันทึกต้นทุนคงที่แล้ว', 'success');
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
  // Form controls (month/date pickers, selects, file inputs) dispatch their
  // data-action on 'change' instead, below — reacting on 'click' too fires
  // before the user picked anything, and for the schedule/financial month
  // inputs that immediately calls render(), which replaces the input DOM
  // node and closes the native picker the instant it opens.
  if (!target || target.matches('input, select')) return;
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
  state.notificationsOlder = [];
  state.notificationsExhausted = false;
  state.notificationsLoadingMore = false;
  unsubscribers.push(DB.subscribeCollection('staff', (items) => { state.staff = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('attendance', (items) => { state.attendance = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('warehouseItems', (items) => { state.warehouseItems = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('warehouseLogs', (items) => { state.warehouseLogs = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('routines', (items) => { state.routines = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('routineInspections', (items) => { state.routineInspections = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('notifications', (items) => { state.notifications = items; render(); }, { orderByField: 'createdAt', limit: NOTIFICATIONS_PAGE_SIZE }));
  unsubscribers.push(DB.subscribeCollection('holidays', (items) => { state.holidays = items; render(); }));
  unsubscribers.push(DB.subscribeCollection('ruleAcknowledgments', (items) => { state.ruleAcknowledgments = items; render(); }));
  if (roleAtLeast(state.user.role, 'admin')) {
    unsubscribers.push(DB.subscribeCollection('fixedCosts', (items) => {
      state.fixedCosts = {};
      items.forEach((i) => { state.fixedCosts[i.id] = i; });
      render();
    }));
    unsubscribers.push(DB.subscribeCollection('managerPay', (items) => {
      state.managerPay = {};
      items.forEach((i) => { state.managerPay[i.id] = i.monthlySalary; });
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
