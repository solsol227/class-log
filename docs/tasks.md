# Class Log 작업 계획

## 현재 기준

- 구현 브랜치: `feat/student-program-management`
- 기준 main commit: `d8c01137855a37f7523ee54501df4336fd80152e`
- migration local/remote 25개 일치
- PR #19 merge 완료
- 학생정보·이용프로그램 통합 관리 구현·검증 진행 중, 아직 미커밋

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

## 다음 핵심 기능 — 학생 일정 상세

- [ ] 내 일정에서 일정 클릭
- [ ] 일정 상세
- [ ] 담당자
- [ ] 본인 출결
- [ ] 게시 피드백
- [ ] 댓글/답글

## 후속

- [ ] 학생 로그인 계정 전용 관리 페이지
- [ ] rental_reservations
- [ ] 새 보강 일정 생성 후 원요청 자동 복귀·연결 UX
- [ ] 브라우저 CRUD E2E 자동화
