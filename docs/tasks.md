# Class Log 작업 계획

## 현재 기준

- 구현 브랜치: `codex/neutral-lessons-allowances`
- 구현 기준 main commit: `5554672055f1fa96ab94a28565edc6c1de7ffb1e` (PR #21)
- migration local/remote 30개 일치
- 중립 lesson·이용권, deadlock·인증 장애 처리, 단일 학생 배정 보존·Draft 집계 비노출 검증 완료
- 실제 merge 상태와 최종 commit은 Git/PR 이력을 기준으로 확인한다.

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
- [x] 게시
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
- [x] 게시 피드백
- [x] 댓글/답글
- [x] 내 피드백 기간 필터·정렬 아카이브
- [x] 학생 보강 수치 조건부 표시 및 사용자 UI 확인

## 후속

- [ ] 학생 로그인 계정 전용 관리 페이지
- [ ] rental_reservations
- [ ] 새 보강 일정 생성 후 원요청 자동 복귀·연결 UX
- [ ] 브라우저 CRUD E2E 자동화
- [ ] 학생 피드백 아카이브 pagination 및 조회 상한 개선 (현재 일정·피드백 200건, 댓글 1,000건)

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
