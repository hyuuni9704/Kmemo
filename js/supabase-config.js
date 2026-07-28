// Supabase 프로젝트 설정
// 1) supabase.com 에서 프로젝트를 생성하고 supabase/schema.sql 내용을 SQL Editor에서 실행
// 2) Settings → API 에서 Project URL, anon public key를 확인해 아래 값을 교체
// anon key는 공개용 키로 클라이언트 코드/저장소에 노출되어도 안전함
// (원본 테이블 접근을 막고 아이디/비밀번호 재검증 RPC 함수로만 데이터에 접근하도록 구성했기 때문)
const SUPABASE_URL = 'https://ubxlxnhoielyvnfjiovp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVieGx4bmhvaWVseXZuZmppb3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMTkxMDQsImV4cCI6MjEwMDc5NTEwNH0.JsD6CgM5BuyiJQoSg-7qBXJiwurE6WVacVoqyuD3Qu4';
