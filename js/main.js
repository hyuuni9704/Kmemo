// 메모앱 - 메인 스크립트

// ===== 로컬스토리지 =====
const STORAGE_KEY = 'kmemo_data';

const DEFAULT_DATA = {
  appName: '메모앱',
  categories: {
    common: '공통',
    personal: '개인',
    business: '사업자',
    extraBusinesses: [] // { id, name }
  },
  memos: [] // 메모 데이터 구조는 CLAUDE.md 참고
};

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DATA));

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  // 이전 버전 데이터 호환: memos 필드가 없으면 추가
  if (!Array.isArray(data.memos)) data.memos = [];

  // 이전 버전 데이터 호환: order 필드(사용자 지정 순서)가 없으면 기존 표시 순서(최신 작성일 우선)를 그대로 유지하도록 채워넣음
  if (data.memos.some((m) => typeof m.order !== 'number')) {
    [...data.memos]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .forEach((memo, index) => { memo.order = index; });
  }

  return data;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  syncPushInBackground();
}

let appData = loadData();

// 현재 대시보드 화면에서 보고 있는 카테고리 id ('common' | 'personal' | 'business' | 사업체 id)
let currentListCategoryId = 'common';
// 현재 수정 중인 메모 id (신규 작성이면 null)
let editingMemoId = null;
// 메모 작성/수정 화면에서 저장/취소 후 돌아갈 화면
let formReturnView = 'list';
// 메인화면(버튼 누르기 전) 통합 미니 달력에서 보고 있는 달
let calendarViewDate = new Date();
// 메인화면 미니달력에서 선택된 날짜 (YYYY-MM-DD)
let mainSelectedDayDateKey = todayKey();
// 카테고리 대시보드 달력에서 보고 있는 달
let dashboardCalendarViewDate = new Date();
// 카테고리 대시보드에서 선택된 날짜 (YYYY-MM-DD)
let selectedDayDateKey = todayKey();
// 전체보기 화면에서 보고 있는 구분
let currentScopeListScope = 'general';

const DEFAULT_MEMO_COLOR = '#4a90e2';

// 메모 작성 시 고를 수 있는 달력 표시 색상 10가지
const MEMO_COLOR_PALETTE = [
  '#4A90E2', '#E74C3C', '#2ECC71', '#F5A623', '#9B59B6',
  '#1ABC9C', '#FF4081', '#F1C40F', '#34495E', '#795548'
];

const SCOPE_LABELS = {
  general: '일반 메모',
  'calendar-month': '이번 달 할 일',
  'business-required': '사업자 필수 항목'
};

// ===== 화면 전환 =====
let currentViewName = 'login';

function showView(viewName) {
  currentViewName = viewName;
  document.getElementById('view-login').hidden = viewName !== 'login';
  document.getElementById('view-main').hidden = viewName !== 'main';
  document.getElementById('view-list').hidden = viewName !== 'list';
  document.getElementById('view-scopelist').hidden = viewName !== 'scopelist';
  document.getElementById('view-search').hidden = viewName !== 'search';
  document.getElementById('view-mypage').hidden = viewName !== 'mypage';
  document.getElementById('view-form').hidden = viewName !== 'form';
}

// 백그라운드 동기화로 데이터가 바뀐 뒤, 현재 보고 있는 화면만 다시 그림
function refreshCurrentView() {
  if (currentViewName === 'main') renderMiniCalendar();
  else if (currentViewName === 'list') renderDashboard();
  else if (currentViewName === 'scopelist') renderScopeList();
}

// ===== 앱 이름 =====
function renderAppName() {
  document.getElementById('appTitle').textContent = appData.appName;
}

function renameAppName() {
  const newName = window.prompt('앱 이름을 입력하세요', appData.appName);
  if (!newName || !newName.trim()) return;

  appData.appName = newName.trim();
  saveData();
  renderAppName();
}

// ===== 카테고리 이름 조회/설정 =====
function getAllCategoryOptions() {
  return [
    { id: 'common', name: appData.categories.common },
    { id: 'personal', name: appData.categories.personal },
    { id: 'business', name: appData.categories.business },
    ...appData.categories.extraBusinesses.map((b) => ({ id: b.id, name: b.name }))
  ];
}

function getCategoryName(id) {
  const option = getAllCategoryOptions().find((opt) => opt.id === id);
  return option ? option.name : '';
}

function setCategoryName(id, name) {
  if (id === 'common') { appData.categories.common = name; return; }
  if (id === 'personal') { appData.categories.personal = name; return; }
  if (id === 'business') { appData.categories.business = name; return; }
  const biz = appData.categories.extraBusinesses.find((b) => b.id === id);
  if (biz) biz.name = name;
}

function renameCategory(id) {
  const currentName = getCategoryName(id);
  const newName = window.prompt('새 이름을 입력하세요', currentName);
  if (!newName || !newName.trim()) return;

  setCategoryName(id, newName.trim());
  saveData();
  renderCommonButton();
  renderCategoryButtons();
}

// ===== 공통 버튼 =====
function renderCommonButton() {
  document.getElementById('commonBtn').textContent = appData.categories.common;
}

function bindCommonButton() {
  document.getElementById('commonBtn').addEventListener('click', () => openDashboard('common'));
  document.getElementById('commonEditBtn').addEventListener('click', () => renameCategory('common'));
}

// ===== 개인 / 사업자 / 추가 사업체 버튼 =====
function renderCategoryButtons() {
  const container = document.getElementById('categoryButtons');
  container.innerHTML = '';

  container.appendChild(createCategoryItem('personal', appData.categories.personal));
  container.appendChild(createCategoryItem('business', appData.categories.business));

  appData.categories.extraBusinesses.forEach((biz) => {
    container.appendChild(createCategoryItem(biz.id, biz.name));
  });
}

function createCategoryItem(id, label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'category-item';

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'btn-category';
  selectBtn.dataset.categoryId = id;
  selectBtn.textContent = label;
  selectBtn.addEventListener('click', () => openDashboard(id));

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-edit';
  editBtn.textContent = '✏';
  editBtn.setAttribute('aria-label', `${label} 이름 변경`);
  editBtn.addEventListener('click', () => renameCategory(id));

  wrapper.appendChild(selectBtn);
  wrapper.appendChild(editBtn);
  return wrapper;
}

// ===== 사업체 추가 =====
function addExtraBusiness() {
  const defaultName = `추가 사업체 ${appData.categories.extraBusinesses.length + 1}`;
  const name = window.prompt('추가할 사업체 이름을 입력하세요', defaultName);
  if (!name || !name.trim()) return;

  const id = `extra_${Date.now()}`;
  appData.categories.extraBusinesses.push({ id, name: name.trim() });
  saveData();
  renderCategoryButtons();
}

// ===== 날짜 유틸 =====
function getDateKey(isoString) {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return getDateKey(new Date().toISOString());
}

function getEffectiveDateKey(memo) {
  return memo.date || getDateKey(memo.createdAt);
}

function formatShortDate(dateKey) {
  const [, m, d] = dateKey.split('-');
  return `${m}.${d}`;
}

// ===== 메모 생성 =====
function createMemo({ title, content, categoryIds, color, scope, date }) {
  const now = new Date().toISOString();
  const existingOrders = appData.memos.map((m) => m.order ?? 0);
  const minOrder = existingOrders.length ? Math.min(...existingOrders) : 0;

  return {
    id: `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    content,
    date: date || '',
    categories: categoryIds,
    color: color || DEFAULT_MEMO_COLOR,
    isDone: false,
    isWatching: false,
    doneAt: null,
    reminder: { type: null, dates: [], intervalDays: null },
    scope: scope || 'general',
    order: minOrder - 1, // 새 메모는 기존 목록 맨 위로 오도록 가장 작은 순서값 부여
    createdAt: now,
    updatedAt: now
  };
}

// ===== 메모 조회 헬퍼 =====
function memoMatchesCategory(memo, categoryId) {
  return categoryId === 'common' || memo.categories.includes(categoryId);
}

function getGeneralMemosForDay(categoryId, dateKey) {
  return appData.memos
    .filter((m) => m.scope === 'general' && memoMatchesCategory(m, categoryId) &&
      (getEffectiveDateKey(m) === dateKey || memoNeedsReminderToday(m, dateKey)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function getGeneralMemosForCategory(categoryId) {
  return appData.memos
    .filter((m) => m.scope === 'general' && memoMatchesCategory(m, categoryId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function getMonthlyTodosForCategory(categoryId) {
  return appData.memos
    .filter((m) => m.scope === 'calendar-month' && memoMatchesCategory(m, categoryId))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt.localeCompare(b.createdAt));
}

function getBusinessRequiredMemos() {
  return appData.memos
    .filter((m) => m.scope === 'business-required')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ===== 카테고리 대시보드 화면 =====
function openDashboard(categoryId) {
  currentListCategoryId = categoryId;
  selectedDayDateKey = todayKey();
  dashboardCalendarViewDate = new Date();
  showView('list');
  renderDashboard();
}

function renderDashboard() {
  document.getElementById('listTitle').textContent = getCategoryName(currentListCategoryId);
  renderDashboardCalendar();
  renderDayMemoCard();
  renderMonthlyTodoCard();
  renderBusinessRequiredCard();
}

function createEmptyMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-message';
  p.textContent = text;
  return p;
}

// ---- 대시보드 달력 (카테고리별, 날짜 클릭 가능) ----
function changeDashboardCalendarMonth(delta) {
  dashboardCalendarViewDate = new Date(
    dashboardCalendarViewDate.getFullYear(),
    dashboardCalendarViewDate.getMonth() + delta,
    1
  );
  renderDashboardCalendar();
}

function renderDashboardCalendar() {
  const year = dashboardCalendarViewDate.getFullYear();
  const month = dashboardCalendarViewDate.getMonth();

  document.getElementById('dashCalendarLabel').textContent = `${year}년 ${month + 1}월`;

  const dateColorMap = {};
  getGeneralMemosForCategory(currentListCategoryId).forEach((memo) => {
    const key = getEffectiveDateKey(memo);
    if (!dateColorMap[key]) dateColorMap[key] = [];
    dateColorMap[key].push({ color: memo.color || DEFAULT_MEMO_COLOR, isReminder: false });
  });
  addReminderDotsForMonth(
    dateColorMap, year, month,
    appData.memos.filter((m) => memoMatchesCategory(m, currentListCategoryId))
  );

  const grid = document.getElementById('dashCalendarGrid');
  grid.innerHTML = '';

  ['일', '월', '화', '수', '목', '금', '토'].forEach((weekday) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = weekday;
    grid.appendChild(cell);
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day calendar-day--empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day calendar-day--clickable';
    if (key === selectedDayDateKey) cell.classList.add('calendar-day--selected');
    if (key === todayKey()) cell.classList.add('calendar-day--today');

    const num = document.createElement('span');
    num.className = 'calendar-day__num';
    num.textContent = day;
    cell.appendChild(num);

    const colors = dateColorMap[key];
    if (colors && colors.length) {
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'calendar-day__dots';
      colors.slice(0, 4).forEach((entry) => {
        const dot = document.createElement('span');
        dot.className = 'calendar-day__dot';
        dot.style.backgroundColor = entry.color;
        if (entry.isReminder) {
          dot.classList.add('calendar-day__dot--reminder');
          dot.style.setProperty('--dot-ring-color', entry.color);
        }
        dotsWrap.appendChild(dot);
      });
      cell.appendChild(dotsWrap);
    }

    cell.addEventListener('click', () => {
      selectedDayDateKey = key;
      renderDashboardCalendar();
      renderDayMemoCard();
    });

    grid.appendChild(cell);
  }
}

// ---- 오늘의 메모 카드 ----
function formatDayLabel(dateKey) {
  if (dateKey === todayKey()) return '오늘의 메모';
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}월 ${d}일의 메모`;
}

function renderDayMemoCard() {
  document.getElementById('dayMemoTitle').textContent = formatDayLabel(selectedDayDateKey);

  const memos = getGeneralMemosForDay(currentListCategoryId, selectedDayDateKey);
  const container = document.getElementById('dayMemoList');
  container.innerHTML = '';

  if (memos.length === 0) {
    container.appendChild(createEmptyMessage('메모가 없습니다.'));
    return;
  }

  memos.slice(0, 5).forEach((memo) => container.appendChild(createDayMemoRow(memo)));
}

function createDayMemoRow(memo, returnView = 'list') {
  const row = document.createElement('div');
  row.className = 'dashboard-row';
  row.addEventListener('click', () => openMemoForm(memo.id, { returnView }));

  const dot = document.createElement('span');
  dot.className = 'dashboard-row__dot';
  dot.style.backgroundColor = memo.color || DEFAULT_MEMO_COLOR;

  const text = document.createElement('span');
  text.className = 'dashboard-row__text';
  text.textContent = memo.title || memo.content.slice(0, 20) || '(제목 없음)';

  const time = document.createElement('span');
  time.className = 'dashboard-row__meta';
  const d = new Date(memo.createdAt);
  time.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  row.appendChild(dot);
  row.appendChild(text);
  row.appendChild(time);
  return row;
}

// ---- 이번 달 할 일 / 사업자 필수 항목 (체크리스트형) ----
function renderMonthlyTodoCard() {
  const memos = getMonthlyTodosForCategory(currentListCategoryId);
  const container = document.getElementById('monthlyTodoList');
  container.innerHTML = '';

  if (memos.length === 0) {
    container.appendChild(createEmptyMessage('이번 달 할 일이 없습니다.'));
    return;
  }

  memos.slice(0, 5).forEach((memo) => container.appendChild(createChecklistRow(memo)));
}

function renderBusinessRequiredCard() {
  const memos = getBusinessRequiredMemos();
  const container = document.getElementById('businessRequiredList');
  container.innerHTML = '';

  if (memos.length === 0) {
    container.appendChild(createEmptyMessage('사업자 필수 항목이 없습니다.'));
    return;
  }

  memos.slice(0, 5).forEach((memo) => container.appendChild(createChecklistRow(memo)));
}

function createChecklistRow(memo) {
  const row = document.createElement('div');
  row.className = 'dashboard-row dashboard-row--checklist';
  if (memo.isDone) row.classList.add('dashboard-row--done');
  if (memo.isWatching) row.classList.add('dashboard-row--watching');
  row.addEventListener('click', () => openMemoForm(memo.id, { returnView: 'list' }));

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = memo.isDone;
  checkbox.className = 'dashboard-row__checkbox';
  checkbox.addEventListener('click', (e) => e.stopPropagation());
  checkbox.addEventListener('change', () => {
    memo.isDone = checkbox.checked;
    memo.doneAt = checkbox.checked ? new Date().toISOString() : null;
    memo.updatedAt = new Date().toISOString();
    saveData();
    renderMonthlyTodoCard();
    renderBusinessRequiredCard();
  });

  const text = document.createElement('span');
  text.className = 'dashboard-row__text';
  text.textContent = memo.title || '(제목 없음)';

  const meta = document.createElement('span');
  meta.className = 'dashboard-row__meta';
  meta.textContent = memo.date ? formatShortDate(memo.date) : '';

  row.appendChild(checkbox);
  row.appendChild(text);

  if (memo.isWatching) {
    const badge = document.createElement('span');
    badge.className = 'watching-badge';
    badge.textContent = '관찰중';
    row.appendChild(badge);
  }

  row.appendChild(meta);

  return row;
}

// ===== 전체보기 화면 =====
function openScopeList(scope) {
  currentScopeListScope = scope;
  showView('scopelist');
  renderScopeList();
}

function renderScopeList() {
  const scope = currentScopeListScope;
  const categoryLabel = getCategoryName(currentListCategoryId);

  document.getElementById('scopeListTitle').textContent =
    scope === 'business-required' ? SCOPE_LABELS[scope] : `${categoryLabel} · ${SCOPE_LABELS[scope]}`;

  let memos;
  if (scope === 'general') memos = getGeneralMemosForCategory(currentListCategoryId);
  else if (scope === 'calendar-month') memos = getMonthlyTodosForCategory(currentListCategoryId);
  else memos = getBusinessRequiredMemos();

  const container = document.getElementById('scopeListContainer');
  container.innerHTML = '';

  if (memos.length === 0) {
    container.appendChild(createEmptyMessage('메모가 없습니다.'));
    return;
  }

  memos.forEach((memo) => {
    const item = scope === 'general' ? createMemoCard(memo) : createChecklistRow(memo);
    container.appendChild(item);
  });
}

// 일반 메모 목록(전체보기)에서 사용자가 직접 순서를 바꿀 수 있도록, 인접한 메모와 order 값을 맞바꿈
function moveMemoOrder(memoId, direction) {
  const list = getGeneralMemosForCategory(currentListCategoryId);
  const index = list.findIndex((m) => m.id === memoId);
  if (index === -1) return;

  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= list.length) return;

  const current = list[index];
  const neighbor = list[neighborIndex];
  const tempOrder = current.order;
  current.order = neighbor.order;
  neighbor.order = tempOrder;

  saveData();
  renderScopeList();
}

function createMemoCard(memo, returnView = 'scopelist') {
  const card = document.createElement('div');
  card.className = 'memo-card';

  const titleEl = document.createElement('h3');
  titleEl.className = 'memo-card__title';
  titleEl.textContent = memo.title || '(제목 없음)';

  const contentEl = document.createElement('p');
  contentEl.className = 'memo-card__content';
  contentEl.textContent = memo.content;

  const tagsEl = document.createElement('div');
  tagsEl.className = 'memo-card__tags';
  memo.categories.forEach((catId) => {
    const tag = document.createElement('span');
    tag.className = 'memo-tag';
    tag.textContent = getCategoryName(catId);
    tagsEl.appendChild(tag);
  });

  const actions = document.createElement('div');
  actions.className = 'memo-card__actions';

  if (returnView === 'scopelist') {
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'btn-memo-move';
    upBtn.textContent = '▲';
    upBtn.setAttribute('aria-label', '위로 이동');
    upBtn.addEventListener('click', () => moveMemoOrder(memo.id, 'up'));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'btn-memo-move';
    downBtn.textContent = '▼';
    downBtn.setAttribute('aria-label', '아래로 이동');
    downBtn.addEventListener('click', () => moveMemoOrder(memo.id, 'down'));

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-memo-edit';
  editBtn.textContent = '수정';
  editBtn.addEventListener('click', () => openMemoForm(memo.id, { returnView }));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-memo-delete';
  deleteBtn.textContent = '삭제';
  deleteBtn.addEventListener('click', () => deleteMemo(memo.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(titleEl);
  card.appendChild(contentEl);
  card.appendChild(tagsEl);
  card.appendChild(actions);

  return card;
}

function deleteMemo(memoId) {
  const ok = window.confirm('이 메모를 삭제하시겠습니까?');
  if (!ok) return;

  appData.memos = appData.memos.filter((memo) => memo.id !== memoId);
  saveData();
  renderMiniCalendar();

  if (!document.getElementById('view-scopelist').hidden) {
    renderScopeList();
  } else if (!document.getElementById('view-search').hidden) {
    renderSearchResults();
  } else {
    renderDashboard();
  }
}

// ===== 메모 작성/수정 화면 =====
function setScopeRadio(scope) {
  document.querySelectorAll('input[name="memoScope"]').forEach((radio) => {
    radio.checked = radio.value === scope;
  });
}

function getSelectedScope() {
  const checked = document.querySelector('input[name="memoScope"]:checked');
  return checked ? checked.value : 'general';
}

function updateStatusFieldVisibility(scope) {
  document.getElementById('statusField').hidden = scope === 'general';
}

// ---- 알림/주기 설정 ----
function getSelectedReminderType() {
  const checked = document.querySelector('input[name="reminderType"]:checked');
  return checked ? checked.value : 'none';
}

function setReminderRadio(type) {
  document.querySelectorAll('input[name="reminderType"]').forEach((radio) => {
    radio.checked = radio.value === type;
  });
}

function updateReminderFieldVisibility(type) {
  document.getElementById('reminderDatesField').hidden = type !== 'dates';
  document.getElementById('reminderIntervalField').hidden = type !== 'interval';
}

function createReminderDateRow(value) {
  const row = document.createElement('div');
  row.className = 'reminder-date-row';

  const input = document.createElement('input');
  input.type = 'date';
  input.value = value || '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-date';
  removeBtn.textContent = '삭제';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(input);
  row.appendChild(removeBtn);
  return row;
}

function renderReminderDatesList(dates) {
  const container = document.getElementById('reminderDatesList');
  container.innerHTML = '';

  const initialDates = dates && dates.length ? dates : [''];
  initialDates.forEach((dateValue) => container.appendChild(createReminderDateRow(dateValue)));
}

function getReminderDatesFromForm() {
  return Array.from(document.querySelectorAll('#reminderDatesList input[type="date"]'))
    .map((el) => el.value)
    .filter(Boolean);
}

// ---- 메모 색상 스와치 ----
function renderColorSwatches(selectedColor) {
  const container = document.getElementById('colorSwatchGroup');
  container.innerHTML = '';

  MEMO_COLOR_PALETTE.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-label', `색상 ${color}`);
    if (color.toLowerCase() === (selectedColor || '').toLowerCase()) {
      swatch.classList.add('color-swatch--selected');
    }
    swatch.addEventListener('click', () => {
      document.getElementById('memoColorInput').value = color;
      renderColorSwatches(color);
    });
    container.appendChild(swatch);
  });
}

function openMemoForm(memoId, options = {}) {
  editingMemoId = memoId || null;
  formReturnView = options.returnView || 'list';

  const memo = editingMemoId ? appData.memos.find((m) => m.id === editingMemoId) : null;
  const scope = memo ? memo.scope : (options.defaultScope || 'general');
  const dateValue = memo ? getEffectiveDateKey(memo) : (options.defaultDate || todayKey());

  document.getElementById('formTitle').textContent = memo ? '메모 수정' : '메모 추가';
  document.getElementById('memoDateInput').value = dateValue;
  setScopeRadio(scope);
  updateStatusFieldVisibility(scope);
  document.getElementById('memoTitleInput').value = memo ? memo.title : '';
  document.getElementById('memoContentInput').value = memo ? memo.content : '';
  document.getElementById('memoColorInput').value = memo ? memo.color : DEFAULT_MEMO_COLOR;
  renderColorSwatches(memo ? memo.color : DEFAULT_MEMO_COLOR);
  document.getElementById('memoDoneInput').checked = memo ? memo.isDone : false;
  document.getElementById('memoWatchingInput').checked = memo ? memo.isWatching : false;
  document.getElementById('deleteMemoBtn').hidden = !memo;

  const reminder = memo ? memo.reminder : null;
  const reminderType = (reminder && reminder.type) || 'none';
  setReminderRadio(reminderType);
  updateReminderFieldVisibility(reminderType);
  renderReminderDatesList(reminder ? reminder.dates : []);
  document.getElementById('reminderIntervalInput').value =
    reminder && reminder.intervalDays ? reminder.intervalDays : '';

  const defaultCategoryIds = memo ? memo.categories : [currentListCategoryId];
  renderCategoryCheckboxes(defaultCategoryIds);

  showView('form');
}

function renderCategoryCheckboxes(selectedIds) {
  const container = document.getElementById('categoryCheckboxes');
  container.innerHTML = '';

  getAllCategoryOptions().forEach((opt) => {
    const label = document.createElement('label');
    label.className = 'category-checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = opt.id;
    input.checked = selectedIds.includes(opt.id);

    const span = document.createElement('span');
    span.textContent = opt.name;

    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);
  });
}

function getCheckedCategoryIds() {
  return Array.from(document.querySelectorAll('#categoryCheckboxes input[type="checkbox"]:checked'))
    .map((el) => el.value);
}

function navigateToFormReturnView() {
  if (formReturnView === 'scopelist') {
    showView('scopelist');
    renderScopeList();
  } else if (formReturnView === 'main') {
    showView('main');
    renderMiniCalendar();
    renderMainTodayMemoCard();
  } else if (formReturnView === 'search') {
    showView('search');
    renderSearchResults();
  } else {
    showView('list');
    renderDashboard();
  }
}

function saveMemoForm() {
  const title = document.getElementById('memoTitleInput').value.trim();
  const content = document.getElementById('memoContentInput').value.trim();
  const categoryIds = getCheckedCategoryIds();
  const color = document.getElementById('memoColorInput').value;
  const scope = getSelectedScope();
  const date = document.getElementById('memoDateInput').value;
  const isDone = document.getElementById('memoDoneInput').checked;
  const isWatching = document.getElementById('memoWatchingInput').checked;
  const reminderTypeInput = getSelectedReminderType();
  const reminder = {
    type: reminderTypeInput === 'none' ? null : reminderTypeInput,
    dates: reminderTypeInput === 'dates' ? getReminderDatesFromForm() : [],
    intervalDays: reminderTypeInput === 'interval'
      ? (parseInt(document.getElementById('reminderIntervalInput').value, 10) || null)
      : null
  };

  if (!title && !content) {
    window.alert('제목이나 내용을 입력해주세요.');
    return;
  }
  if (categoryIds.length === 0) {
    window.alert('카테고리를 하나 이상 선택해주세요.');
    return;
  }

  const isNewMemo = !editingMemoId;

  if (editingMemoId) {
    const memo = appData.memos.find((m) => m.id === editingMemoId);
    const wasDone = memo.isDone;
    memo.title = title;
    memo.content = content;
    memo.categories = categoryIds;
    memo.color = color;
    memo.scope = scope;
    memo.date = date;
    memo.isDone = isDone;
    if (isDone && !wasDone) memo.doneAt = new Date().toISOString();
    else if (!isDone) memo.doneAt = null;
    memo.isWatching = isWatching;
    memo.reminder = reminder;
    memo.updatedAt = new Date().toISOString();
  } else {
    const newMemo = createMemo({ title, content, categoryIds, color, scope, date });
    newMemo.isDone = isDone;
    newMemo.doneAt = isDone ? new Date().toISOString() : null;
    newMemo.isWatching = isWatching;
    newMemo.reminder = reminder;
    appData.memos.push(newMemo);
  }

  saveData();
  renderMiniCalendar();

  if (isNewMemo) {
    // 저장 후 같은 화면에서 바로 다음 메모를 이어서 작성할 수 있도록 입력칸만 비움
    document.getElementById('memoTitleInput').value = '';
    document.getElementById('memoContentInput').value = '';
    document.getElementById('memoDoneInput').checked = false;
    document.getElementById('memoWatchingInput').checked = false;
    setReminderRadio('none');
    updateReminderFieldVisibility('none');
    renderReminderDatesList([]);
    document.getElementById('reminderIntervalInput').value = '';
    document.getElementById('memoTitleInput').focus();
  } else {
    navigateToFormReturnView();
  }
}

function deleteMemoFromForm() {
  if (!editingMemoId) return;
  const ok = window.confirm('이 메모를 삭제하시겠습니까?');
  if (!ok) return;

  appData.memos = appData.memos.filter((memo) => memo.id !== editingMemoId);
  saveData();
  renderMiniCalendar();
  navigateToFormReturnView();
}

// ===== 메인화면 통합 미니 달력 (전체 카테고리) =====
function changeCalendarMonth(delta) {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
  renderMiniCalendar();
}

function renderMiniCalendar() {
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth(); // 0-indexed

  document.getElementById('calendarLabel').textContent = `${year}년 ${month + 1}월`;

  // 날짜별 메모 색상 모음 (일반 메모의 날짜 기준 + 알림/주기에 해당하는 날짜)
  const dateColorMap = {};
  appData.memos.filter((m) => m.scope === 'general').forEach((memo) => {
    const key = getEffectiveDateKey(memo);
    if (!dateColorMap[key]) dateColorMap[key] = [];
    dateColorMap[key].push({ color: memo.color || DEFAULT_MEMO_COLOR, isReminder: false });
  });
  addReminderDotsForMonth(dateColorMap, year, month, appData.memos);

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  ['일', '월', '화', '수', '목', '금', '토'].forEach((weekday) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = weekday;
    grid.appendChild(cell);
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day calendar-day--empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day calendar-day--clickable';
    if (key === todayKey()) cell.classList.add('calendar-day--today');
    if (key === mainSelectedDayDateKey) cell.classList.add('calendar-day--selected');

    const num = document.createElement('span');
    num.className = 'calendar-day__num';
    num.textContent = day;
    cell.appendChild(num);

    const colors = dateColorMap[key];

    if (colors && colors.length) {
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'calendar-day__dots';
      colors.slice(0, 4).forEach((entry) => {
        const dot = document.createElement('span');
        dot.className = 'calendar-day__dot';
        dot.style.backgroundColor = entry.color;
        if (entry.isReminder) {
          dot.classList.add('calendar-day__dot--reminder');
          dot.style.setProperty('--dot-ring-color', entry.color);
        }
        dotsWrap.appendChild(dot);
      });
      cell.appendChild(dotsWrap);
    }

    cell.addEventListener('click', () => {
      mainSelectedDayDateKey = key;
      renderMiniCalendar();
    });

    grid.appendChild(cell);
  }

  renderMainTodayMemoCard();
}

// 메인화면 미니달력 아래: 선택된 날짜에 작성된 메모 (전체 카테고리 통합, 기본값은 오늘)
function renderMainTodayMemoCard() {
  document.getElementById('mainTodayMemoTitle').textContent = formatDayLabel(mainSelectedDayDateKey);

  const memos = getGeneralMemosForDay('common', mainSelectedDayDateKey);
  const container = document.getElementById('mainTodayMemoList');
  container.innerHTML = '';

  if (memos.length === 0) {
    const message = mainSelectedDayDateKey === todayKey()
      ? '오늘 작성된 메모가 없습니다.'
      : '해당 날짜에 작성된 메모가 없습니다.';
    container.appendChild(createEmptyMessage(message));
    return;
  }

  memos.slice(0, 5).forEach((memo) => container.appendChild(createDayMemoRow(memo, 'main')));
}

// ===== 로그인 화면 =====
function showLoginError(message) {
  const errorEl = document.getElementById('loginErrorMsg');
  errorEl.textContent = message;
  errorEl.hidden = false;
}

async function handleLoginSubmit() {
  const username = document.getElementById('loginUsernameInput').value.trim();
  const password = document.getElementById('loginPasswordInput').value;

  document.getElementById('loginErrorMsg').hidden = true;

  if (!username) {
    showLoginError('아이디를 입력해주세요.');
    return;
  }
  if (password.length < 4) {
    showLoginError('비밀번호는 4자 이상 입력해주세요.');
    return;
  }

  try {
    await loginWithCredentials(username, password);
  } catch (err) {
    if (err.message === 'WRONG_PASSWORD') {
      showLoginError('비밀번호가 일치하지 않습니다.');
    } else {
      showLoginError('인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    }
    return;
  }

  // 새로 로그인하는 경우, 이 기기에는 아직 로컬 데이터가 없을 수 있으므로
  // 화면을 그리기 전에 서버 데이터를 먼저 받아와 병합해야 다른 기기의 메모가 바로 보임
  const submitBtn = document.getElementById('loginSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '동기화 중...';

  await startMainAppAfterLogin();

  submitBtn.disabled = false;
  submitBtn.textContent = '확인';
}

function bindLoginView() {
  document.getElementById('loginSubmitBtn').addEventListener('click', handleLoginSubmit);
  document.getElementById('loginUsernameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLoginSubmit();
  });
  document.getElementById('loginPasswordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLoginSubmit();
  });
}

// ===== 로그아웃 =====
function bindLogoutButton() {
  document.getElementById('logoutBtn').hidden = false;
  document.getElementById('logoutBtn').addEventListener('click', () => {
    const ok = window.confirm('로그아웃하시겠습니까? 다음에 다시 아이디/비밀번호를 입력해야 합니다.');
    if (ok) logout();
  });
}

// ===== 검색 =====
function bindSearchButton() {
  document.getElementById('searchBtn').hidden = false;
  document.getElementById('searchBtn').addEventListener('click', openSearchView);
}

function openSearchView() {
  showView('search');
  document.getElementById('searchInput').value = '';
  renderSearchResults();
  document.getElementById('searchInput').focus();
}

// ===== 마이페이지 =====
function bindMypageButton() {
  document.getElementById('mypageBtn').hidden = false;
  document.getElementById('mypageBtn').addEventListener('click', openMypageView);
}

function openMypageView() {
  showView('mypage');
  document.getElementById('newUsernameInput').value = '';
  document.getElementById('newPasswordInput').value = '';
  document.getElementById('newPasswordConfirmInput').value = '';
  [document.getElementById('updateStatusMsg'), document.getElementById('usernameChangeMsg'), document.getElementById('passwordChangeMsg')]
    .forEach((el) => { el.hidden = true; el.textContent = ''; });
}

function showMypageMessage(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.hidden = false;
}

async function handleChangeUsernameClick() {
  const newUsername = document.getElementById('newUsernameInput').value.trim();
  if (!newUsername) {
    showMypageMessage('usernameChangeMsg', '새 아이디를 입력해주세요.');
    return;
  }

  const btn = document.getElementById('changeUsernameBtn');
  btn.disabled = true;
  try {
    await changeUsername(newUsername);
    showMypageMessage('usernameChangeMsg', '아이디가 변경되었습니다.');
    document.getElementById('newUsernameInput').value = '';
  } catch (err) {
    if (err.message === 'USERNAME_TAKEN') showMypageMessage('usernameChangeMsg', '이미 사용 중인 아이디입니다.');
    else if (err.message === 'NO_SESSION') showMypageMessage('usernameChangeMsg', '로그인이 필요합니다.');
    else showMypageMessage('usernameChangeMsg', '인터넷 연결을 확인한 뒤 다시 시도해주세요.');
  } finally {
    btn.disabled = false;
  }
}

async function handleChangePasswordClick() {
  const newPassword = document.getElementById('newPasswordInput').value;
  const confirmPassword = document.getElementById('newPasswordConfirmInput').value;

  if (newPassword.length < 4) {
    showMypageMessage('passwordChangeMsg', '비밀번호는 4자 이상 입력해주세요.');
    return;
  }
  if (newPassword !== confirmPassword) {
    showMypageMessage('passwordChangeMsg', '비밀번호 확인이 일치하지 않습니다.');
    return;
  }

  const btn = document.getElementById('changePasswordBtn');
  btn.disabled = true;
  try {
    await changePassword(newPassword);
    showMypageMessage('passwordChangeMsg', '비밀번호가 변경되었습니다.');
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('newPasswordConfirmInput').value = '';
  } catch (err) {
    if (err.message === 'NO_SESSION') showMypageMessage('passwordChangeMsg', '로그인이 필요합니다.');
    else showMypageMessage('passwordChangeMsg', '인터넷 연결을 확인한 뒤 다시 시도해주세요.');
  } finally {
    btn.disabled = false;
  }
}

// 메모 제목/내용 기준, 전체 카테고리 통합 검색 (대소문자 구분 없음)
function searchMemos(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return appData.memos
    .filter((memo) => (memo.title || '').toLowerCase().includes(q) || (memo.content || '').toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function renderSearchResults() {
  const query = document.getElementById('searchInput').value;
  const container = document.getElementById('searchResultsContainer');
  container.innerHTML = '';

  if (!query.trim()) {
    container.appendChild(createEmptyMessage('검색어를 입력하세요.'));
    return;
  }

  const results = searchMemos(query);
  if (results.length === 0) {
    container.appendChild(createEmptyMessage('검색 결과가 없습니다.'));
    return;
  }

  results.forEach((memo) => container.appendChild(createMemoCard(memo, 'search')));
}

// ===== 수동 동기화 버튼 =====
async function handleManualSyncClick() {
  const btn = document.getElementById('updateSyncBtn');
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = '동기화 중...';

  const result = await manualSync();

  if (result.ok) {
    refreshCurrentView();
    btn.textContent = '완료!';
  } else {
    btn.textContent = '실패 (오프라인?)';
  }

  setTimeout(() => {
    btn.textContent = originalText;
    btn.disabled = false;
  }, 1500);
}

// ===== 앱 진입 =====
// 기존 세션으로 재진입: 로컬 데이터로 즉시 화면을 그리고(오프라인 우선), 동기화는 백그라운드로 진행
function startMainApp() {
  bindLogoutButton();
  bindSearchButton();
  bindMypageButton();
  initMainApp();
  syncOnLoad();
}

// 방금 로그인/등록한 경우: 이 기기에 로컬 데이터가 없을 수 있으므로
// 서버 동기화가 끝난 뒤에 화면을 그려서 다른 기기의 메모가 처음부터 보이게 함
async function startMainAppAfterLogin() {
  bindLogoutButton();
  bindSearchButton();
  bindMypageButton();
  await syncOnLoad();
  initMainApp();
}

// ===== 알림/주기 체크 =====
// 메모별로 하루에 한 번만 알림이 뜨도록 (메모id -> 마지막으로 알림을 보낸 날짜) 기록
const NOTIFIED_KEY = 'kmemo_notified';

function loadNotifiedMap() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY)) || {};
  } catch {
    return {};
  }
}

function saveNotifiedMap(map) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}

function daysBetween(fromDateKey, toDateKey) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const from = new Date(`${fromDateKey}T00:00:00`);
  const to = new Date(`${toDateKey}T00:00:00`);
  return Math.round((to - from) / msPerDay);
}

function memoNeedsReminderToday(memo, todayKeyValue) {
  const reminder = memo.reminder;
  if (!reminder || !reminder.type) return false;

  // 완료 처리된 메모는 완료된 날짜 이후로는 알람이 다시 뜨지 않도록 함
  if (memo.isDone && memo.doneAt && todayKeyValue > getDateKey(memo.doneAt)) {
    return false;
  }

  if (reminder.type === 'dates') {
    return Array.isArray(reminder.dates) && reminder.dates.includes(todayKeyValue);
  }

  if (reminder.type === 'interval' && reminder.intervalDays > 0) {
    const startKey = getDateKey(memo.createdAt);
    const diff = daysBetween(startKey, todayKeyValue);
    return diff >= 0 && diff % reminder.intervalDays === 0;
  }

  return false;
}

// 달력에 표시할 연/월(year/month) 범위 안에서, 알림(주기) 조건에 해당하는 날짜에 메모 색상을 추가
function addReminderDotsForMonth(dateColorMap, year, month, memos) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    memos.forEach((memo) => {
      if (!memoNeedsReminderToday(memo, key)) return;
      if (!dateColorMap[key]) dateColorMap[key] = [];
      dateColorMap[key].push({ color: memo.color || DEFAULT_MEMO_COLOR, isReminder: true });
    });
  }
}

function checkReminders() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  const runCheck = () => {
    const today = todayKey();
    const notifiedMap = loadNotifiedMap();

    appData.memos.forEach((memo) => {
      if (!memoNeedsReminderToday(memo, today)) return;
      if (notifiedMap[memo.id] === today) return;

      new Notification(memo.title || '메모 알림', { body: memo.content || '' });
      notifiedMap[memo.id] = today;
    });

    saveNotifiedMap(notifiedMap);
  };

  if (Notification.permission === 'granted') {
    runCheck();
  } else {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') runCheck();
    });
  }
}

function initMainApp() {
  renderAppName();
  renderCommonButton();
  renderCategoryButtons();
  bindCommonButton();
  renderMiniCalendar();
  checkReminders();
  showView('main');

  document.getElementById('appTitle').addEventListener('click', renameAppName);
  document.getElementById('addBusinessBtn').addEventListener('click', addExtraBusiness);
  document.getElementById('updateSyncBtn').addEventListener('click', handleManualSyncClick);
  document.getElementById('calendarPrevBtn').addEventListener('click', () => changeCalendarMonth(-1));
  document.getElementById('calendarNextBtn').addEventListener('click', () => changeCalendarMonth(1));

  document.getElementById('listBackBtn').addEventListener('click', () => {
    showView('main');
    renderMiniCalendar();
  });
  document.getElementById('dashCalendarPrevBtn').addEventListener('click', () => changeDashboardCalendarMonth(-1));
  document.getElementById('dashCalendarNextBtn').addEventListener('click', () => changeDashboardCalendarMonth(1));

  document.getElementById('dayMemoSeeAllBtn').addEventListener('click', () => openScopeList('general'));
  document.getElementById('monthlyTodoSeeAllBtn').addEventListener('click', () => openScopeList('calendar-month'));
  document.getElementById('businessSeeAllBtn').addEventListener('click', () => openScopeList('business-required'));

  document.getElementById('dayMemoAddBtn').addEventListener('click', () => openMemoForm(null, {
    returnView: 'list', defaultScope: 'general', defaultDate: selectedDayDateKey
  }));
  document.getElementById('monthlyTodoAddBtn').addEventListener('click', () => openMemoForm(null, {
    returnView: 'list', defaultScope: 'calendar-month', defaultDate: ''
  }));
  document.getElementById('businessRequiredAddBtn').addEventListener('click', () => openMemoForm(null, {
    returnView: 'list', defaultScope: 'business-required', defaultDate: ''
  }));

  document.getElementById('scopeListBackBtn').addEventListener('click', () => {
    showView('list');
    renderDashboard();
  });

  document.getElementById('searchBackBtn').addEventListener('click', () => {
    showView('main');
    renderMiniCalendar();
  });
  document.getElementById('searchInput').addEventListener('input', renderSearchResults);

  document.getElementById('mypageBackBtn').addEventListener('click', () => {
    showView('main');
    renderMiniCalendar();
  });
  document.getElementById('checkUpdateBtn').addEventListener('click', handleCheckUpdateClick);
  document.getElementById('changeUsernameBtn').addEventListener('click', handleChangeUsernameClick);
  document.getElementById('changePasswordBtn').addEventListener('click', handleChangePasswordClick);

  document.querySelectorAll('input[name="memoScope"]').forEach((radio) => {
    radio.addEventListener('change', () => updateStatusFieldVisibility(getSelectedScope()));
  });

  document.querySelectorAll('input[name="reminderType"]').forEach((radio) => {
    radio.addEventListener('change', () => updateReminderFieldVisibility(getSelectedReminderType()));
  });
  document.getElementById('addReminderDateBtn').addEventListener('click', () => {
    document.getElementById('reminderDatesList').appendChild(createReminderDateRow(''));
  });

  document.getElementById('formCancelBtn').addEventListener('click', () => navigateToFormReturnView());
  document.getElementById('deleteMemoBtn').addEventListener('click', deleteMemoFromForm);
  document.getElementById('memoFormEl').addEventListener('submit', (e) => {
    e.preventDefault();
    saveMemoForm();
  });
}

function init() {
  bindLoginView();

  if (loadSession()) {
    startMainApp();
  } else {
    showView('login');
  }
}

document.addEventListener('DOMContentLoaded', init);

// ===== 오프라인 지원 (Service Worker 등록) + 앱 업데이트 감지/적용 =====
// 새 버전은 곧바로 적용되지 않고 "대기(waiting)" 상태로 대기함(sw.js에서 skipWaiting을 자동 호출하지 않음).
// 앱을 열 때(로그인 시)마다 아직 적용 안 된 새 버전이 있으면 매번 자동으로 물어보거나,
// 마이페이지의 "지금 업데이트 확인" 버튼으로 언제든 수동 적용 가능.
// 어느 경로든 메모 데이터(localStorage)는 캐시와 완전히 분리되어 있어 그대로 보존됨.
let swRegistration = null;
let manualUpdateCheckActive = false;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      swRegistration = registration;

      // 등록 시점에 이미 새 버전이 설치되어 대기 중인 경우
      if (registration.waiting && navigator.serviceWorker.controller) {
        onNewVersionReady();
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // controller가 있어야(=이전에 이미 설치된 버전이 있어야) "업데이트"로 취급
          // (첫 설치는 새로 물어볼 대상이 없으므로 제외)
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            onNewVersionReady();
          }
        });
      });
    } catch {
      // 등록 실패해도 오프라인 우선 동작에는 영향 없음
    }
  });

  let alreadyReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (alreadyReloaded) return;
    alreadyReloaded = true;
    window.location.reload();
  });
}

// 새 버전이 활성화 대기 상태가 되었을 때의 공통 진입점
function onNewVersionReady() {
  if (manualUpdateCheckActive) {
    manualUpdateCheckActive = false;
    showMypageMessage('updateStatusMsg', '새 버전을 적용합니다...');
    applyPendingUpdate();
    return;
  }
  promptForUpdate();
}

// 앱을 열 때(로그인 시)마다 적용 안 된 새 버전이 있으면 매번 물어봄(하루 1회 제한 없음)
function promptForUpdate() {
  const ok = window.confirm('새 버전이 있습니다. 지금 업데이트하시겠습니까?\n(작성하신 메모는 그대로 안전하게 유지됩니다)');
  if (ok) applyPendingUpdate();
}

function applyPendingUpdate() {
  if (swRegistration && swRegistration.waiting) {
    swRegistration.waiting.postMessage('SKIP_WAITING');
  }
}

// 마이페이지 "지금 업데이트 확인" 버튼: 하루 1회 제한 없이 즉시 새 버전을 확인하고, 있으면 바로 적용
async function handleCheckUpdateClick() {
  if (!('serviceWorker' in navigator) || !swRegistration) {
    showMypageMessage('updateStatusMsg', '이 브라우저에서는 업데이트 확인을 지원하지 않습니다.');
    return;
  }

  showMypageMessage('updateStatusMsg', '업데이트를 확인하는 중...');
  manualUpdateCheckActive = true;

  try {
    await swRegistration.update();
  } catch {
    manualUpdateCheckActive = false;
    showMypageMessage('updateStatusMsg', '인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    return;
  }

  setTimeout(() => {
    if (manualUpdateCheckActive) {
      manualUpdateCheckActive = false;
      showMypageMessage('updateStatusMsg', '이미 최신 버전입니다.');
    }
  }, 1500);
}

registerServiceWorker();
