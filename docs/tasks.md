# Class Log 작업 계획

## 현재 기준

- PR #16 merge 완료
- merge commit: `dc69f7bc072aabf5d81399870f5469179b05d793`
- main = origin/main
- migration local/remote 17개 일치
- ESLint / production build / git diff --check 통과
- 운영자/학생 smoke test 통과
- working tree clean

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

## 다음 PR — 운영 UX 정리

- [ ] 직원 수정
- [ ] 직원 삭제
- [ ] 직원 활성 상태 UX 단순화
- [ ] 보강 수정
- [ ] 보강 삭제
- [ ] 운영자/학생 로그인 페이지 뒤로가기

## 다음 핵심 기능 — 사유결석 기반 보강

목표:
`사유결석 → 보강 가능 건 → 보강 대기 → 일정 배정 → 완료`

설계 전 확인:
- [ ] excused 1건당 보강 1건인지
- [ ] 원 출결을 나중에 수정하면 기존 보강을 어떻게 처리할지
- [ ] scheduled/completed 보강이 있으면 원 출결 수정 제한이 필요한지
- [ ] cancelled 후 재생성 허용 여부
- [ ] 예외적 수동 보강 필요 여부
- [ ] makeup과 attendance_record 직접 FK 연결 여부
- [ ] 기존 보강 데이터 migration 필요 여부

완료 목표:
- [ ] 사유결석 근거 없는 보강 생성 차단
- [ ] 같은 사유결석 중복 보강 차단
- [ ] 학생별 보강 가능 건 표시
- [ ] 원 출결 ↔ 보강 추적

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
