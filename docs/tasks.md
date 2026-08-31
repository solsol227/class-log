# Class Log 작업 계획

## 현재 기준

- PR #18 구현 브랜치: `feat/operator-ux-improvements`
- 기준 main commit: `03b1d66ef5154ad125ebe90a6a9a74d4ad5b99f6`
- migration local/remote 20개 일치
- ESLint / TypeScript / production build / DB lint / git diff --check 통과
- 기존 사용자 데이터 mutation 없이 구현
- PR #18 변경은 아직 미커밋

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

## 구현 중 — PR #18 운영 UX 정리

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
- [ ] 운영자 브라우저 mutation 확인

PR #19로 유지:
- [ ] `makeup_lessons.attendance_record_id`
- [ ] excused 출결 1건당 보강 가능 건 1개
- [ ] 원 출결 상태 수정 시 보강 처리 정책
- [ ] scheduled/completed 보강 연결 시 출결 변경 제한
- [ ] cancelled 후 보강 재생성 정책
- [ ] 예외적인 수동 보강 허용 여부
- [ ] replacement assignment provenance
- [ ] provenance 기반 scheduled 보강 안전 삭제
- [ ] scheduled 보강 대기 복귀/replacement 교체 정책

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
- [ ] 현재 `학생 + 임의 원수업 + 사유` 등록 UI를 특정 excused attendance 선택 흐름으로 교체

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
