# Class Log 작업 계획

## 구현 완료·사용자 확인 대기 — PR36 직원 담당 일정 월간 캘린더

- [x] 최신 main(PR33 포함) 기준 별도 worktree와 브랜치
- [x] KST 현재 월 초기화와 `month=YYYY-MM` URL 상태
- [x] 이전·다음 달 이동, native month picker, 잘못된 query 복구
- [x] 선택 월 범위의 담당 일정과 active 학생 배정 일괄 조회
- [x] compact 예정 일정 카드와 학생 이름 3명/모바일 2명 축약
- [x] 6주 월간 캘린더, 상태 범례, 일별 최대 2건과 `+N` 전체 보기
- [x] 일정 상세 링크와 제목·시간·학생 수·상태 접근성 이름
- [x] ESLint / TypeScript / production build / diff check
- [x] owner/student 로그인 및 보호 화면 read-only 검증
- [ ] 사용자 production UI 확인

## 현재 기준

- 구현 브랜치: `codex/neutral-lessons-allowances`
- 구현 기준 main commit: `5554672055f1fa96ab94a28565edc6c1de7ffb1e` (PR #21)
- migration local/remote 30개 일치
- 중립 lesson·이용권, deadlock·인증 장애 처리, 단일 학생 배정 보존·Draft 집계 비노출 검증 완료
- 실제 merge 상태와 최종 commit은 Git/PR 이력을 기준으로 확인한다.

## 구현·검증 중 — PR33 학생 상세 UX와 피드백 단일 상태

- [x] 삭제 표시 피드백·댓글 현황과 게시 상태 의존성 사전 조사
- [x] 기존 삭제 표시 피드백 4건·댓글 1건 물리 삭제, 이후 7일 보존 pg_cron 적용
- [x] `published_at`과 게시 상태 query·배지·control 제거
- [x] 학생 피드백 RLS를 본인 active assignment·비-Draft·미삭제 조건으로 재정의
- [x] 학생 상세 최근 4개 피드백 카드 단순화
- [x] 하나의 이용권을 사용하는 atomic 일정 일괄 배정 RPC와 다중 선택 UI
- [x] 기존 일정 저장 RPC와 batch assignment의 lesson → student 잠금 순서 통일
- [x] 학생정보·이용프로그램 편집 분리 유지
- [x] 이용프로그램 카드에 이용 횟수·조정·이력·중단 UI 통합
- [x] 원격 migration 적용, 데이터 전후 개수·권한·RLS·DB lint 검증
- [x] production build와 실계정 로그인 smoke test
- [x] 사용자 브라우저 확인

## 구현·검증 완료 — PR32 일정 상세 학생별 피드백 modal

- [x] 최신 PR31/PR30 포함 main에서 기능 브랜치 생성
- [x] roster의 새 탭 작성 링크를 학생별 modal trigger로 전환
- [x] 일정 상세 하단 피드백 대시보드 제거
- [x] 신규 피드백 저장 후 modal 유지
- [x] 기존 피드백 읽기 전용 표시와 삭제되지 않은 댓글/답글 count 배지
- [x] owner/staff 제공자와 담당 일정 관계 서버 재검증
- [x] 학생별 독립 수정 route 제거 및 학생 피드백 조회 dialog inline 수정
- [x] 조회 dialog에서 본인 댓글·답글 수정 및 soft-delete
- [x] 학생 상세의 학생정보·이용프로그램 독립 카드와 영역별 action 정리
- [x] ESLint / TypeScript / production build / diff check
- [x] 사용자 production UI 확인

## 구현·검증 완료 — 일정 hard delete 및 Draft 목록 빠른 확정

- [x] 최신 main 기준 별도 worktree와 append-only migration
- [x] 피드백·활성 보강을 보호하는 원자적 hard delete RPC
- [x] active/soft-unassigned assignment, lesson staff와 출결 함께 삭제
- [x] 취소 lesson에 연결된 취소 보강·event 함께 삭제
- [x] 피드백/댓글·보강별 구체적 삭제 차단 사유
- [x] assignment 집계 기반 예약·사용 횟수 반환
- [x] 삭제 dialog와 목록 Draft 빠른 확정 카드 UI
- [x] 삭제·확정 권한 경계를 서버/DB 공통 owner 검사로 분리
- [x] PR30 owner/staff 작업 병합 후 최신 main 반영
- [x] 임시 operator 경계를 정식 owner 검사로 교체
- [x] owner 삭제·확정 허용, staff 조회 허용·삭제/확정 차단 최종 검증
- [x] student/anon 삭제·확정 차단 최종 검증
- [x] append-only migration 원격 적용 및 local/remote 35개 일치
- [x] 존재하지 않는 UUID로 owner/staff/student/anon 원격 권한 smoke test
- [x] 최종 staged diff 확인 전 전체 검증

PR30의 `operator_accounts`를 권한 source of truth로 사용한다. owner만 일정 삭제와 Draft 확정을 수행하며 staff는 일정 조회만 가능하다.

## 완료 — PR #15 보안 hardening

- [x] security-definer helper 권한 정리
- [x] `current_student_id()` private schema 이동
- [x] 기존 RLS dependency 유지

후속:
- [ ] Supabase Auth `auth_leaked_password_protection` 설정 점검

## 완료 — PR #16 데이터모델/운영 기능

### 학생/프로그램
- [x] age integer
- [x] 선택형 acquisition_source
- [x] nickname 단일화
- [x] display_name/category 제거
- [x] student_programs
- [x] effective inactive view
- [x] 기존 데이터 backfill

### 일정
- [x] program_type
- [x] Draft
- [x] 학생 Draft 미노출
- [x] Draft도 충돌 대상
- [x] student_program_id 연결
- [x] soft-unassign 유지
- [x] advisory lock + overlap trigger
- [x] `save_lesson_with_assignments`
- [x] `confirm_draft_lesson`
- [x] 시간 변경 + 학생 제거 동시 처리

### 직원
- [x] staff_profiles
- [x] lesson_staff
- [x] 복수 담당자
- [x] `replace_lesson_staff`
- [x] 담당직원 저장 성공 안내

### 피드백
- [x] 다중 feedback
- [x] 실제 제공 직원
- [x] soft-delete
- [x] 단일 공개 상태
- [x] 댓글/답글 thread
- [x] legacy feedback_responses 제거
- [x] mutation 0행/오류 성공 오표시 방지
- [x] 운영자 학생 상세 최근 4건과 학생별 전체 피드백 조회
- [x] 공통 조회 dialog와 그룹레슨 학생별 새 탭 작성

### 보강
- [x] 대기/예정/완료
- [x] 열린 보강 중복 방지
- [x] 동일 프로그램 검증
- [x] 기존 일정 배정
- [x] Draft 일정 배정
- [x] `schedule_makeup_lesson`
- [x] `complete_makeup_lesson`
- [x] 관련 화면 cache revalidation

## 완료 — PR #18 운영 UX 정리

- [x] 직원 이름/역할 수정
- [x] 모든 직원 삭제를 복원 가능한 보관으로 통일
- [x] 삭제된 직원 복원
- [x] 직원 상세 대시보드와 담당 일정/피드백 이력
- [x] 직원 활성 상태 UX 단순화
- [x] 담당 직원 차등 갱신과 기존 보관 직원 관계 유지
- [x] requested/scheduled 보강 사유 수정
- [x] requested 보강 안전 삭제
- [x] completed/cancelled 보강 이력 표시
- [x] 운영자/학생 로그인 페이지에서 로그인 선택 화면 이동
- [x] 일정 종료 시각 기준 예정/완료 표시
- [x] 일정 상세 상단 `수정 → 저장` 및 하단 취소 UX
- [x] 출결 저장과 lesson 완료 상태 분리
- [x] 일정 저장 시 `ends_at` 기준 scheduled/completed 계산
- [x] 운영자 조회 lesson ID 범위의 종료 상태 동기화
- [x] 학생 조회는 mutation 없이 시간 기준 display fallback 유지
- [x] 피드백 댓글/답글 작성자 표시
- [x] 학생 내 일정 담당 직원 표시
- [x] 운영자 브라우저 mutation 확인

## 완료 — PR #19 사유결석 기반 보강

목표:
`사유결석 → 보강 가능 건 → 보강 대기 → 일정 배정 → 완료`

- [x] `makeup_lessons.attendance_record_id` 필수 UNIQUE와 복합 FK
- [x] replacement attendance 직접 연결
- [x] excused 출결 저장 시 entitlement 자동 생성
- [x] 같은 사유결석 중복 entitlement 차단
- [x] requested/scheduled/completed/cancelled 상태 전이와 우회 차단
- [x] 일정 매칭 해제와 권리 취소 분리
- [x] cancelled 동일 row 재개
- [x] replacement present/absent/excused 완료 흐름
- [x] 원 출결 non-excused 변경 보호
- [x] replacement assignment provenance
- [x] 보수적 명시적 assignment soft-unassign
- [x] 일반 일정 수정의 scheduled replacement assignment 해제 우회 차단
- [x] 원 출결 기반 entitlement 자동 취소/동일 row 재개
- [x] 대체 일정 출결 기반 자동 완료 및 연쇄 entitlement
- [x] 대체 일정 변경 시 보강 소유 이전 assignment 자동 soft-unassign
- [x] 수동 매칭 해제/취소/재개/완료 UX 제거
- [x] event 원인 기록
- [x] 일반 운영자 event 원인의 NULL 정규화와 일정 변경 RPC 회귀 수정
- [x] operator-only append-only event history
- [x] 임의 생성 및 hard delete UI 제거
- [x] 사유결석 기반 대기/예정/완료/취소 화면
- [x] 기존 데이터 0건 확인 후 append-only migration 적용
- [x] local/remote migration history 및 DB lint 확인
- [x] rollback 기반 원격 RPC 검증과 사용자 브라우저 확인

## 구현 중 — 학생정보·이용프로그램 통합 관리

- [x] 실제 enrollment/assignment/view 상태 조사
- [x] profile과 program reconciliation 단일 RPC transaction
- [x] active 프로그램 중단일·사유 입력
- [x] stopped 이력 및 중단 사유 수정
- [x] 재개 시 새 active enrollment 생성
- [x] 미래 활성 배정이 있는 프로그램 중단 차단
- [x] 독립 이용프로그램 추가·중단 action/UI 제거
- [x] 전체/진행중/휴식/이용종료 URL 상태 필터
- [x] 학생 이름 검색과 독립 이용프로그램 URL 필터
- [x] 진행중 안의 장기 미배정 배지와 마지막 배정 경과 표시
- [x] operator/student RLS 구조 유지
- [x] rollback 기반 원격 RPC 검증
- [ ] 사용자 production UI 확인

## 구현·검증 완료 — 학생 일정 상세 (PR #23)

- [x] 내 일정에서 일정 클릭
- [x] 일정 상세
- [x] 담당자
- [x] 본인 출결
- [x] 본인 피드백
- [x] 댓글/답글
- [x] 내 피드백 기간 필터·정렬 아카이브
- [x] 학생 보강 수치 조건부 표시 및 사용자 UI 확인

## 후속

- [ ] 학생 로그인 계정 전용 관리 페이지
- [ ] rental_reservations
- [ ] 새 보강 일정 생성 후 원요청 자동 복귀·연결 UX
- [ ] 브라우저 CRUD E2E 자동화
- [ ] 학생 피드백 아카이브 pagination 및 조회 상한 개선 (현재 일정·피드백 200건, 댓글 1,000건)

## 구현 중 — PR34 일정 및 학생 피드백 Compact UX

- [x] 운영자 일정 카테고리·상태 필터 데스크톱 한 줄 배치
- [x] 학생 일정 카드와 이용권 문구 압축
- [x] 학생 일정 상세 정보 4항목 반응형 압축
- [x] 일정·피드백 목록 query를 보존하는 안전한 내부 복귀 경로
- [x] 일정 상세 피드백 카드와 기존 댓글 thread 재사용
- [x] 학생 피드백 빠른 기간·즉시 정렬 필터와 카드 압축
- [x] 피드백 작성 modal 단일 panel scroll과 배경 scroll lock
- [x] ESLint / TypeScript / production build / diff check
- [ ] 사용자 production UI 확인

## 구현·검증 완료 — 중립 lesson과 학생 프로그램 이용권

- [x] `lessons.program_type` 및 exact-match 설계 제거
- [x] assignment를 `student_program_id` 이용권 귀속으로 전환
- [x] Draft 0차감, Scheduled 확정 quota 검증
- [x] 시작 전·무기록 soft-unassign 반환 보호
- [x] student program 기본 제공량과 append-only adjustment
- [x] makeup `source_student_program_id` 고정 및 stopped source 허용
- [x] 일정 학생별 이용권 선택 UI와 roster 표시
- [x] 보강 lesson 프로그램 후보 필터 제거
- [x] 학생 상세 이용 횟수/조정 UI
- [x] 학생 본인 이용권·일정별 사용 이용권 표시와 자기 소유 집계 RPC
- [x] SQL 회귀 테스트 추가 및 기존 보강 테스트 중립 lesson 대응
- [x] local/remote migration 적용 및 DB lint (28개 일치)
- [x] operator/student/anon 실제 RLS 및 rollback 핵심 DB 검증
- [x] 실제 두 DB 세션에서 확정/저장 deadlock 재현 및 수정 후 경합·rollback 검증
- [ ] production UI 사용자 확인

## 구현 중 — PR #21 운영 화면 UX 개선

- [x] 학생 등록 비밀번호 press-and-hold 보기
- [x] 일정관리 URL query 상태 필터와 동기화 후 분류
- [x] 일정 상세의 새 일정 등록 동선
- [x] 직원 저장/삭제 버튼 모바일 포함 한 줄 배치
- [x] 보강 원수업 일정 카드 전체 링크
- [ ] production UI 사용자 확인

## PR24 — 운영 UX 및 일정 카테고리 (코드·원격 migration 완료, 사용자 확인 대기)

- [x] 최신 main(PR22/23 병합) 기준 독립 worktree
- [x] 일정 카테고리 생성·수정·미분류 배지·URL 필터
- [x] 기본정보/프로그램 독립 저장·취소와 전용 RPC
- [x] Draft 취소 숨김, 삭제·확정 취소 보호 유지
- [x] 새 일정 등록 링크 유지, 비밀번호 보기 종료·접근성 보완
- [x] ESLint / tsc / production build / diff check
- [x] 원격 읽기 전용 schema·이력·DB lint
- [x] 메모리 PostgreSQL 32개 migration 및 34개 회귀 검증
- [x] 원격 신규 migration 적용 및 local/remote 32개 일치·DB lint
- [ ] 사용자 브라우저 확인 (migration 적용 후)
- 상세: docs/pr24-operator-ux-review.md

## PR26 — 보강 완료 정책 정정

- [x] 기존 완료 탭 유지, 새 완료 상태/완료 탭 추가 없음
- [x] 대체 일정 출결 완료와 일정 없이 수동 완료를 모두 `status = completed`로 처리
- [x] 완료 경로를 내부 `completion_method`로 식별해 복구 가능 여부 판정
- [x] 일정 없이 완료 시 replacement lesson/attendance/assignment 미생성
- [x] 일정 없이 완료 처리자·시각·선택 메모 기록
- [x] 일정 없이 수동 완료한 보강만 같은 row를 `requested`로 복구
- [x] 완료·복구의 완료 경로·처리자·시각·메모를 append-only event row로 보존
- [x] PR26 DB 회귀 테스트 SQL 작성
- [x] 대상 ESLint / TypeScript / production build / diff check
- [x] PGlite에서 33개 migration 및 PR26 포함 50개 회귀 검증
- [x] 원격 32개 migration 일치·PR26 dry-run·현재 schema DB lint
- [x] 로컬 Supabase ref 일치·원격 DB branch 없음 확인 (primary DB로 취급)
- [ ] PR 병합 후 primary Supabase migration 적용
- [ ] operator/student RLS 회귀 검증

## 구현·검증 완료 — 직원 개별 운영계정과 owner/staff 권한 (PR30)

- [x] 실제 Auth/staff 분포와 local/remote migration 이력 read-only 확인
- [x] 기존 유일 operator를 owner로 bootstrap하는 append-only migration
- [x] 업무 역할과 접근 권한 source of truth 분리
- [x] 신규·기존 직원 계정 생성과 실패 시 Auth 보상 삭제
- [x] owner 전용 비밀번호 재설정·로그인 중지·재활성화
- [x] 직원 보관·복원과 같은 Auth 계정 상태 연동
- [x] 공통 `/operator/*` capability 기반 read-only UI
- [x] 담당 staff 출결·피드백·댓글 server action 및 RLS 제한
- [x] 로그인 중지 기존 세션의 proxy/layout/RPC/RLS 차단
- [x] 합성 in-memory DB와 Auth 경계 회귀 테스트
- [x] PR30 migration 원격 적용 및 DB lint
- [x] 실제 staff 계정 생성·로그인·중지 브라우저 확인 (사용자가 직접 수행)
- [x] 후속 일정 hard delete·Draft 빠른 확정에서 owner capability 연결
