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
  return data;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
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
// 카테고리 대시보드 달력에서 보고 있는 달
let dashboardCalendarViewDate = new Date();
// 카테고리 대시보드에서 선택된 날짜 (YYYY-MM-DD)
let selectedDayDateKey = todayKey();
// 전체보기 화면에서 보고 있는 구분
let currentScopeListScope = 'general';

const DEFAULT_MEMO_COLOR = '#4a90e2';

const SCOPE_LABELS = {
  general: '일반 메모',
  'calendar-month': '이번 달 할 일',
  'business-required': '사업자 필수 항목'
};

// ===== 화면 전환 =====
function showView(viewName) {
  document.getElementById('view-main').hidden = viewName !== 'main';
  document.getElementById('view-list').hidden = viewName !== 'list';
  document.getElementById('view-scopelist').hidden = viewName !== 'scopelist';
  document.getElementById('view-form').hidden = viewName !== 'form';
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
  return {
    id: `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    content,
    date: date || '',
    categories: categoryIds,
    color: color || DEFAULT_MEMO_COLOR,
    isDone: false,
    isWatching: false,
    reminder: { type: null, dates: [], intervalDays: null },
    scope: scope || 'general',
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
    .filter((m) => m.scope === 'general' && memoMatchesCategory(m, categoryId) && getEffectiveDateKey(m) === dateKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function getGeneralMemosForCategory(categoryId) {
  return appData.memos
    .filter((m) => m.scope === 'general' && memoMatchesCategory(m, categoryId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    dateColorMap[key].push(memo.color || DEFAULT_MEMO_COLOR);
  });

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
      colors.slice(0, 4).forEach((color) => {
        const dot = document.createElement('span');
        dot.className = 'calendar-day__dot';
        dot.style.backgroundColor = color;
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

function createDayMemoRow(memo) {
  const row = document.createElement('div');
  row.className = 'dashboard-row';
  row.addEventListener('click', () => openMemoForm(memo.id, { returnView: 'list' }));

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

function createMemoCard(memo) {
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

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-memo-edit';
  editBtn.textContent = '수정';
  editBtn.addEventListener('click', () => openMemoForm(memo.id, { returnView: 'scopelist' }));

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
  document.getElementById('memoDoneInput').checked = memo ? memo.isDone : false;
  document.getElementById('memoWatchingInput').checked = memo ? memo.isWatching : false;
  document.getElementById('deleteMemoBtn').hidden = !memo;

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
    memo.title = title;
    memo.content = content;
    memo.categories = categoryIds;
    memo.color = color;
    memo.scope = scope;
    memo.date = date;
    memo.isDone = isDone;
    memo.isWatching = isWatching;
    memo.updatedAt = new Date().toISOString();
  } else {
    const newMemo = createMemo({ title, content, categoryIds, color, scope, date });
    newMemo.isDone = isDone;
    newMemo.isWatching = isWatching;
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

  // 날짜별 메모 색상 모음 (일반 메모의 날짜 기준)
  const dateColorMap = {};
  appData.memos.filter((m) => m.scope === 'general').forEach((memo) => {
    const key = getEffectiveDateKey(memo);
    if (!dateColorMap[key]) dateColorMap[key] = [];
    dateColorMap[key].push(memo.color || DEFAULT_MEMO_COLOR);
  });

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
    const cell = document.createElement('div');
    cell.className = 'calendar-day';

    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (key === todayKey()) cell.classList.add('calendar-day--today');

    const num = document.createElement('span');
    num.className = 'calendar-day__num';
    num.textContent = day;
    cell.appendChild(num);

    const colors = dateColorMap[key];

    if (colors && colors.length) {
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'calendar-day__dots';
      colors.slice(0, 4).forEach((color) => {
        const dot = document.createElement('span');
        dot.className = 'calendar-day__dot';
        dot.style.backgroundColor = color;
        dotsWrap.appendChild(dot);
      });
      cell.appendChild(dotsWrap);
    }

    grid.appendChild(cell);
  }
}

// ===== 초기화 =====
function init() {
  renderAppName();
  renderCommonButton();
  renderCategoryButtons();
  bindCommonButton();
  renderMiniCalendar();
  showView('main');

  document.getElementById('appTitle').addEventListener('click', renameAppName);
  document.getElementById('addBusinessBtn').addEventListener('click', addExtraBusiness);
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

  document.querySelectorAll('input[name="memoScope"]').forEach((radio) => {
    radio.addEventListener('change', () => updateStatusFieldVisibility(getSelectedScope()));
  });

  document.getElementById('formCancelBtn').addEventListener('click', () => navigateToFormReturnView());
  document.getElementById('deleteMemoBtn').addEventListener('click', deleteMemoFromForm);
  document.getElementById('memoFormEl').addEventListener('submit', (e) => {
    e.preventDefault();
    saveMemoForm();
  });
}

document.addEventListener('DOMContentLoaded', init);
