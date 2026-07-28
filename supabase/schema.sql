-- Kmemo 로그인/기기 간 동기화용 Supabase 스키마 (아이디+비밀번호 방식)
-- 사용법: Supabase 대시보드 → SQL Editor → 아래 전체 내용을 붙여넣고 실행(Run)
-- 원본 테이블은 익명/일반 접근을 완전히 차단하고, 아이디+비밀번호를 매번 재검증하는
-- 함수(RPC)를 통해서만 데이터에 접근하도록 구성함.
--
-- 참고: 이전 버전(PIN 4자리 방식)에서 이 방식으로 변경하면서 기존 함수/테이블 구조를
-- 재사용할 수 없어 아래에서 기존 객체를 먼저 삭제(drop)하고 새로 만듦.
-- (테스트 계정만 있던 단계라 기존 데이터 보존 없이 초기화함)

create extension if not exists pgcrypto;

drop function if exists public.auth_login(text);
drop function if exists public.get_memos(uuid, text);
drop function if exists public.sync_memos(uuid, text, jsonb);
drop table if exists public.kmemo_data;
drop table if exists public.kmemo_users;

-- ===== 테이블 =====
create table public.kmemo_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table public.kmemo_data (
  user_id uuid primary key references public.kmemo_users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kmemo_users enable row level security;
alter table public.kmemo_data enable row level security;

-- 정책을 하나도 만들지 않아 RLS가 모든 직접 접근을 차단함.
-- anon/authenticated 권한도 명시적으로 회수하여 테이블 직접 접근을 막음.
revoke all on public.kmemo_users from anon, authenticated;
revoke all on public.kmemo_data from anon, authenticated;

-- ===== 함수(RPC): 매 호출마다 아이디+비밀번호를 서버에서 해시 비교로 재검증 =====

-- 로그인/최초 등록: 아이디가 없으면 새로 만들고, 있으면 비밀번호를 검증
create or replace function public.auth_login(p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_stored_hash text;
  v_input_hash text;
begin
  if length(trim(p_username)) < 1 then
    raise exception 'INVALID_USERNAME';
  end if;
  if length(p_password) < 4 then
    raise exception 'INVALID_PASSWORD';
  end if;

  v_input_hash := encode(digest(p_password, 'sha256'), 'hex');

  select id, password_hash into v_user_id, v_stored_hash
  from public.kmemo_users where username = p_username;

  if v_user_id is null then
    insert into public.kmemo_users (username, password_hash) values (p_username, v_input_hash)
    returning id into v_user_id;
    insert into public.kmemo_data (user_id, data) values (v_user_id, '[]'::jsonb);
    return v_user_id;
  end if;

  if v_stored_hash <> v_input_hash then
    raise exception 'WRONG_PASSWORD';
  end if;

  return v_user_id;
end;
$$;

-- 서버에 저장된 메모 전체를 가져옴 (아이디+비밀번호가 일치해야 함)
create or replace function public.get_memos(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_data jsonb;
begin
  select d.data into v_data
  from public.kmemo_data d
  join public.kmemo_users u on u.id = d.user_id
  where u.username = p_username
    and u.password_hash = encode(digest(p_password, 'sha256'), 'hex');

  if v_data is null then
    raise exception 'AUTH_FAILED';
  end if;

  return v_data;
end;
$$;

-- 로컬 메모 전체를 서버에 덮어쓰기 (아이디+비밀번호가 일치해야 함)
create or replace function public.sync_memos(p_username text, p_password text, p_memos jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id
  from public.kmemo_users u
  where u.username = p_username
    and u.password_hash = encode(digest(p_password, 'sha256'), 'hex');

  if v_user_id is null then
    raise exception 'AUTH_FAILED';
  end if;

  update public.kmemo_data
  set data = p_memos, updated_at = now()
  where user_id = v_user_id;
end;
$$;

-- anon 키로 호출 가능하도록 함수 실행 권한만 부여 (테이블 직접 접근 권한은 없음)
grant execute on function public.auth_login(text, text) to anon;
grant execute on function public.get_memos(text, text) to anon;
grant execute on function public.sync_memos(text, text, jsonb) to anon;
