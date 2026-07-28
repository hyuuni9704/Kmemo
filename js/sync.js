// 로그인(아이디+비밀번호 인증) 및 기기 간 메모 동기화

const SESSION_KEY = 'kmemo_session';

let supabaseClient = null;

// Supabase 설정이 채워져 있을 때만 클라이언트를 생성 (미설정 시 오프라인 전용으로 동작)
function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.startsWith('YOUR_')) return null;
  if (typeof window.supabase === 'undefined') return null;

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

// ===== 세션(로그인 상태) =====
function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ===== 아이디+비밀번호 로그인/최초 등록 =====
// 성공 시 세션을 저장하고 반환, 실패 시 예외를 던짐
async function loginWithCredentials(username, password) {
  const client = getSupabaseClient();
  if (!client) throw new Error('OFFLINE_OR_NOT_CONFIGURED');

  const { data, error } = await client.rpc('auth_login', {
    p_username: username,
    p_password: password
  });
  if (error) throw error;

  const session = { userId: data, username, password };
  saveSession(session);
  return session;
}

function logout() {
  clearSession();
  window.location.reload();
}

// ===== 동기화 =====
async function pullRemoteMemos(session) {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.rpc('get_memos', {
    p_username: session.username,
    p_password: session.password
  });

  if (error) {
    console.warn('원격 메모 불러오기 실패', error);
    return null;
  }
  return data;
}

async function pushLocalMemos(session) {
  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client.rpc('sync_memos', {
    p_username: session.username,
    p_password: session.password,
    p_memos: appData.memos
  });

  if (error) console.warn('동기화 실패(다음 동기화 시점에 다시 시도됩니다)', error);
}

// 서버 메모와 로컬 메모를 id 기준으로 병합, updatedAt이 더 최신인 쪽을 채택
function mergeRemoteMemos(remoteMemos) {
  if (!Array.isArray(remoteMemos)) return;

  const localById = new Map(appData.memos.map((m) => [m.id, m]));

  remoteMemos.forEach((remoteMemo) => {
    const localMemo = localById.get(remoteMemo.id);
    if (!localMemo || new Date(remoteMemo.updatedAt) > new Date(localMemo.updatedAt)) {
      localById.set(remoteMemo.id, remoteMemo);
    }
  });

  appData.memos = Array.from(localById.values());
  saveData();
}

// 로그인 직후/앱 실행 시 백그라운드로 서버와 동기화 (실패해도 오프라인 사용에는 영향 없음)
async function syncOnLoad() {
  const session = loadSession();
  if (!session) return;

  const remoteMemos = await pullRemoteMemos(session);
  if (remoteMemos) {
    mergeRemoteMemos(remoteMemos);
    refreshCurrentView();
    await pushLocalMemos(session); // 병합 결과를 서버에도 반영
  }
}

// 메모 저장 시마다 백그라운드로 서버에 반영 시도 (오프라인이면 조용히 건너뜀)
function syncPushInBackground() {
  const session = loadSession();
  if (!session) return;
  pushLocalMemos(session).catch(() => {});
}

// "업데이트" 버튼을 눌렀을 때 실행하는 수동 동기화
// 같은 아이디+비밀번호로 로그인된 다른 기기가 올려둔 메모를 받아오고, 병합 결과를 다시 서버에 반영함
async function manualSync() {
  const session = loadSession();
  if (!session) return { ok: false, reason: 'NO_SESSION' };

  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'OFFLINE_OR_NOT_CONFIGURED' };

  const remoteMemos = await pullRemoteMemos(session);
  if (remoteMemos === null) return { ok: false, reason: 'SYNC_FAILED' };

  mergeRemoteMemos(remoteMemos);
  await pushLocalMemos(session);
  return { ok: true };
}
