-- Kmemo 로그인/기기 간 동기화용 Supabase 스키마
-- 사용법: Supabase 대시보드 → SQL Editor → 아래 전체 내용을 붙여넣고 실행(Run)
-- 4자리 PIN만으로 인증하므로, 원본 테이블은 익명/일반 접근을 완전히 차단하고
-- PIN을 매번 재검증하는 함수(RPC)를 통해서만 데이터에 접근하도록 구성함.

create extension if not exists pgcrypto;

-- ===== 테이블 =====
create table if not exists public.kmemo_users (
  id uuid primary key default gen_random_uuid(),
  pin_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.kmemo_data (
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

-- ===== 함수(RPC): 매 호출마다 PIN을 서버에서 해시 비교로 재검증 =====

-- 로그인/최초 등록: PIN이 없으면 새로 만들고, 있으면 해당 user_id 반환
create or replace function public.auth_login(p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_user_id uuid;
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'INVALID_PIN_FORMAT';
  end if;

  v_hash := encode(digest(p_pin, 'sha256'), 'hex');

  select id into v_user_id from public.kmemo_users where pin_hash = v_hash;

  if v_user_id is null then
    insert into public.kmemo_users (pin_hash) values (v_hash) returning id into v_user_id;
    insert into public.kmemo_data (user_id, data) values (v_user_id, '[]'::jsonb);
  end if;

  return v_user_id;
end;
$$;

-- 서버에 저장된 메모 전체를 가져옴 (user_id + pin이 일치해야 함)
create or replace function public.get_memos(p_user_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_data jsonb;
begin
  v_hash := encode(digest(p_pin, 'sha256'), 'hex');

  select d.data into v_data
  from public.kmemo_data d
  join public.kmemo_users u on u.id = d.user_id
  where d.user_id = p_user_id and u.pin_hash = v_hash;

  if v_data is null then
    raise exception 'AUTH_FAILED';
  end if;

  return v_data;
end;
$$;

-- 로컬 메모 전체를 서버에 덮어쓰기 (user_id + pin이 일치해야 함)
create or replace function public.sync_memos(p_user_id uuid, p_pin text, p_memos jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_match boolean;
begin
  select exists(
    select 1 from public.kmemo_users
    where id = p_user_id and pin_hash = encode(digest(p_pin, 'sha256'), 'hex')
  ) into v_match;

  if not v_match then
    raise exception 'AUTH_FAILED';
  end if;

  update public.kmemo_data
  set data = p_memos, updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- anon 키로 호출 가능하도록 함수 실행 권한만 부여 (테이블 직접 접근 권한은 없음)
grant execute on function public.auth_login(text) to anon;
grant execute on function public.get_memos(uuid, text) to anon;
grant execute on function public.sync_memos(uuid, text, jsonb) to anon;
