import Link from "next/link";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  completeMakeupWithoutSchedule,
  rescheduleMakeup,
  scheduleMakeup,
  restoreManualMakeupCompletion,
} from "./actions";
import { MakeupReasonEditor } from "./makeup-reason-editor";

const STATUS_LABELS: Record<string, string> = {
  requested: "보강 대기",
  scheduled: "보강 예정",
  completed: "완료",
  cancelled: "취소",
};

const ATTENDANCE_LABELS: Record<string, string> = {
  present: "출석",
  absent: "결석",
  excused: "사유결석",
};

const EVENT_LABELS: Record<string, string> = {
  created: "보강 권리 생성",
  scheduled: "일정 매칭",
  rescheduled: "일정 변경",
  unmatched: "일정 매칭 해제",
  completed: "보강 완료",
  cancelled: "보강 권리 취소",
  reopened: "보강 권리 재개",
};

const EVENT_CAUSE_LABELS: Record<string, string> = {
  operator: "운영자 처리",
  source_attendance: "원 출결 변경",
  replacement_attendance: "대체 일정 출결",
};

const LESSON_STATUS_LABELS: Record<string, string> = {
  draft: "임시",
  scheduled: "예정",
  completed: "종료",
  cancelled: "취소",
};

const PROGRAM_LABELS: Record<string, string> = {
  weekday_vocal: "평일보컬",
  weekend_vocal: "주말보컬",
  trial: "체험",
  rental: "대여",
};

type MakeupNotices = {
  error?: string;
  scheduled?: string;
  rescheduled?: string;
  reasonUpdated?: string;
  manualCompleted?: string;
  restored?: string;
};

function errorMessage(code?: string) {
  if (code === "reason_state") return "보강 상태가 변경되어 사유를 수정할 수 없습니다.";
  if (code === "reason") return "보강 사유를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "conflict") return "학생의 다른 일정과 시간이 겹쳐 보강 일정을 배정할 수 없습니다.";
  if (code === "program") return "보강권의 source 이용권과 대체 일정 상태를 확인해 주세요.";
  if (code === "replacement_used") return "이 학생의 해당 일정은 다른 보강에 이미 사용 중입니다.";
  if (code === "same_replacement") return "현재 대체 일정과 다른 일정을 선택해 주세요.";
  if (code === "assignment_history") return "이전 대체 일정에 보존해야 할 출결 또는 피드백 기록이 있어 일정을 변경할 수 없습니다.";
  if (code === "state") return "보강 상태가 변경되었습니다. 현재 상태를 다시 확인해 주세요.";
  if (code === "restore_state") return "대체 일정 출결로 완료된 보강은 보강 대기로 복구할 수 없습니다.";
  if (code === "restore") return "보강 완료를 복구하지 못했습니다. 현재 상태를 확인해 주세요.";
  if (code === "manual_complete") return "일정 없이 완료 처리하지 못했습니다. 현재 상태를 확인해 주세요.";
  if (code) return "보강 정보를 처리하지 못했습니다. 선택 항목과 현재 상태를 확인해 주세요.";
  return null;
}

function successMessage(notices: MakeupNotices) {
  if (notices.reasonUpdated === "1") return "보강 사유를 저장했습니다.";
  if (notices.scheduled === "1") return "보강 일정을 배정했습니다.";
  if (notices.rescheduled === "1") return "보강 일정을 변경하고 보강이 만든 이전 학생 배정을 자동으로 정리했습니다.";
  if (notices.manualCompleted === "1") return "보강을 일정 없이 완료 처리했습니다.";
  if (notices.restored === "1") return "보강을 대기 상태로 복구했습니다.";
  return null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export default async function MakeupPage({ searchParams }: { searchParams: Promise<MakeupNotices> }) {
  const access = await requireOperatorAccess();
  const notices = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [makeupsResult, studentsResult, lessonsResult, eventsResult, programsResult] = await Promise.all([
    supabase
      .from("makeup_lessons")
      .select("id, attendance_record_id, replacement_attendance_record_id, source_student_program_id, student_id, original_lesson_id, replacement_lesson_id, reason, status, created_at, completion_method, completed_at, completion_note")
      .order("created_at"),
    supabase.from("students").select("id, nickname").order("nickname"),
    supabase.from("lessons").select("id, title, starts_at, status").order("starts_at"),
    supabase
      .from("makeup_lesson_events")
      .select("id, makeup_lesson_id, event_type, event_cause, created_at")
      .order("created_at"),
    supabase.from("student_programs").select("id, program_type"),
  ]);
  if (makeupsResult.error || studentsResult.error || lessonsResult.error || eventsResult.error || programsResult.error) {
    throw new Error("보강 정보를 불러오지 못했습니다.", {
      cause: makeupsResult.error ?? studentsResult.error ?? lessonsResult.error ?? eventsResult.error ?? programsResult.error,
    });
  }

  const makeups = makeupsResult.data;
  const students = studentsResult.data;
  const lessons = lessonsResult.data;
  const events = eventsResult.data;
  const programById = new Map(programsResult.data.map((program) => [program.id, program.program_type]));
  const attendanceIds = [...new Set(makeups.flatMap((item) => [
    item.attendance_record_id,
    item.replacement_attendance_record_id,
  ]).filter((id): id is string => Boolean(id)))];
  const { data: attendanceRecords, error: attendanceError } = attendanceIds.length
    ? await supabase.from("attendance_records").select("id, status").in("id", attendanceIds)
    : { data: [], error: null };
  if (attendanceError) {
    throw new Error("보강 출결 정보를 불러오지 못했습니다.", { cause: attendanceError });
  }

  const attendanceById = new Map((attendanceRecords ?? []).map((record) => [record.id, record.status]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const studentName = (id: string) => students.find((student) => student.id === id)?.nickname ?? "확인할 수 없는 학생";
  const lessonTitle = (id: string | null) => id ? lessonById.get(id)?.title ?? "확인할 수 없는 일정" : "배정되지 않음";
  const failure = errorMessage(notices.error);
  const success = successMessage(notices);

  function replacementOptions(originalLessonId: string) {
    return lessons.filter((lesson) => (
      lesson.id !== originalLessonId
      && (lesson.status === "draft" || lesson.status === "scheduled")
    ));
  }

  function renderEventHistory(makeupId: string) {
    const itemEvents = events.filter((event) => event.makeup_lesson_id === makeupId);
    if (itemEvents.length === 0) return null;
    return (
      <details className="mt-4 border-t border-[var(--line)] pt-3 text-sm">
        <summary className="cursor-pointer font-bold text-[var(--accent-strong)]">처리 이력 {itemEvents.length}건</summary>
        <ol className="mt-3 space-y-2 text-[var(--muted)]">
          {itemEvents.map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {EVENT_LABELS[event.event_type] ?? event.event_type}
                <span className="ml-2 text-xs">· {EVENT_CAUSE_LABELS[event.event_cause] ?? event.event_cause}</span>
              </span>
              <time>{formatDateTime(event.created_at)}</time>
            </li>
          ))}
        </ol>
      </details>
    );
  }

  function renderGroup(status: string) {
    const items = makeups.filter((item) => item.status === status);
    return (
      <section key={status}>
        <h2 className="text-xl font-bold">{STATUS_LABELS[status]}</h2>
        {items.length ? (
          <ul className="mt-3 space-y-3">
            {items.map((item) => {
              const options = replacementOptions(item.original_lesson_id);
              const sourceStatus = attendanceById.get(item.attendance_record_id);
              const replacementStatus = item.replacement_attendance_record_id
                ? attendanceById.get(item.replacement_attendance_record_id)
                : null;
              const originalLesson = lessonById.get(item.original_lesson_id);
              const replacementLesson = item.replacement_lesson_id
                ? lessonById.get(item.replacement_lesson_id)
                : null;
              const changeOptions = options.filter((lesson) => lesson.id !== item.replacement_lesson_id);
              return (
                <li key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
                  <p className="font-bold">{studentName(item.student_id)}</p>
                  <Link
                    href={`/operator/schedules/${item.original_lesson_id}`}
                    className="group mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[#f8fbfa] p-3 transition hover:border-[#a9c8c4] hover:bg-white hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">원수업: {lessonTitle(item.original_lesson_id)}</span>
                      {originalLesson ? <span className="mt-1 block text-sm text-[var(--muted)]">발생일: {formatDateTime(originalLesson.starts_at)}</span> : null}
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-lg font-bold text-[var(--accent-strong)] transition group-hover:translate-x-0.5">→</span>
                  </Link>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    근거 출결: {sourceStatus ? ATTENDANCE_LABELS[sourceStatus] ?? sourceStatus : "확인 불가"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--accent-strong)]">보강 이용권: {PROGRAM_LABELS[programById.get(item.source_student_program_id) ?? ""] ?? "확인 불가"}</p>
                  {access.canManageMakeup && (status === "requested" || status === "scheduled") ? (
                    <MakeupReasonEditor makeupId={item.id} reason={item.reason} />
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{item.reason || "사유 없음"}</p>
                  )}

                  {status === "requested" && access.canManageMakeup ? (
                    <>
                      {options.length ? (
                        <form action={scheduleMakeup.bind(null, item.id)} className="mt-4 space-y-2">
                          <label className="block text-sm font-bold" htmlFor={`replacement-${item.id}`}>대체 일정</label>
                          <select id={`replacement-${item.id}`} name="replacement_lesson_id" required className="h-10 w-full rounded-lg border px-2">
                            {options.map((lesson) => (
                              <option key={lesson.id} value={lesson.id}>{lesson.title} · {formatDateTime(lesson.starts_at)}</option>
                            ))}
                          </select>
                          <button className="h-10 w-full rounded-lg border font-bold">일정 배정</button>
                        </form>
                      ) : (
                        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">배정 가능한 Draft 또는 예정 일정이 없습니다.</p>
                      )}
                      <Link href="/operator/schedules/new" className="mt-2 block text-center text-sm font-bold underline">새 일정 생성</Link>
                      <form action={completeMakeupWithoutSchedule.bind(null, item.id)} className="mt-4 space-y-2 border-t border-[var(--line)] pt-4">
                        <label className="block text-sm font-bold" htmlFor={`complete-note-${item.id}`}>일정 없이 완료</label>
                        <AutoResizeTextarea
                          id={`complete-note-${item.id}`}
                          name="completion_note"
                          maxLength={500}
                          className="w-full rounded-lg border px-3 py-2 text-sm leading-6"
                          placeholder="선택 메모"
                        />
                        <button className="h-10 w-full rounded-lg border font-bold">일정 없이 완료</button>
                      </form>
                    </>
                  ) : status === "scheduled" && item.replacement_lesson_id ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-lg bg-[#f4f8f7] p-3 text-sm">
                        <p className="font-bold">대체: {lessonTitle(item.replacement_lesson_id)}</p>
                        <p className="mt-1 text-[var(--muted)]">일정 상태: {replacementLesson ? LESSON_STATUS_LABELS[replacementLesson.status] ?? replacementLesson.status : "확인 불가"}</p>
                        <p className="mt-1 text-[var(--muted)]">출결: {replacementStatus ? ATTENDANCE_LABELS[replacementStatus] ?? replacementStatus : "아직 기록되지 않음"}</p>
                        <p className="mt-2 text-xs text-[var(--muted)]">대체 일정에서 출결을 저장하면 보강이 자동으로 완료됩니다.</p>
                      </div>
                      {access.canManageMakeup && changeOptions.length ? (
                        <form action={rescheduleMakeup.bind(null, item.id, item.replacement_lesson_id)} className="space-y-2 border-t border-[var(--line)] pt-4">
                          <label className="block text-sm font-bold" htmlFor={`reschedule-${item.id}`}>대체 일정 변경</label>
                          <select id={`reschedule-${item.id}`} name="replacement_lesson_id" required className="h-10 w-full rounded-lg border px-2">
                            {changeOptions.map((lesson) => (
                              <option key={lesson.id} value={lesson.id}>{lesson.title} · {formatDateTime(lesson.starts_at)}</option>
                            ))}
                          </select>
                          <button className="h-10 w-full rounded-lg border font-bold">일정 변경</button>
                          <p className="text-xs text-[var(--muted)]">보강이 생성하거나 복구한 이전 학생 배정은 안전 조건을 확인한 뒤 자동으로 해제됩니다.</p>
                        </form>
                      ) : null}
                    </div>
                  ) : status === "completed" ? (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
                      <p className="font-bold">
                        {item.completion_method === "manual_without_schedule" ? "일정 없이 완료" : "대체 일정 완료"}
                      </p>
                      {item.completion_method === "manual_without_schedule" ? (
                        <>
                          {item.completed_at ? <p className="mt-1 text-[var(--muted)]">처리: {formatDateTime(item.completed_at)}</p> : null}
                          {item.completion_note ? <p className="mt-2 whitespace-pre-wrap">{item.completion_note}</p> : null}
                          {access.canManageMakeup ? <form action={restoreManualMakeupCompletion.bind(null, item.id)} className="mt-3">
                            <button className="h-10 w-full rounded-lg border border-emerald-700 bg-white font-bold text-emerald-950">보강 대기로 복구</button>
                          </form> : null}
                        </>
                      ) : (
                        <>
                          <p className="mt-1">대체: {lessonTitle(item.replacement_lesson_id)}</p>
                          <p className="mt-1 font-bold">결과: {replacementStatus ? ATTENDANCE_LABELS[replacementStatus] ?? replacementStatus : "확인 불가"}</p>
                        </>
                      )}
                    </div>
                  ) : status === "cancelled" ? (
                    <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                      {item.replacement_lesson_id ? <p className="mb-3 text-sm">마지막 대체 일정: {lessonTitle(item.replacement_lesson_id)}</p> : null}
                      <p>원 출결이 사유결석이 아닌 상태로 변경되어 자동 취소됐습니다.</p>
                      <p className="mt-1">원 출결을 다시 사유결석으로 저장하면 같은 보강 기록이 자동으로 대기 상태로 돌아옵니다.</p>
                    </div>
                  ) : null}
                  {renderEventHistory(item.id)}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">해당 보강이 없습니다.</p>
        )}
      </section>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <h1 className="text-3xl font-bold">보강관리</h1>
      <p className="mt-3 text-[var(--muted)]">사유결석을 저장하면 보강 대기가 자동으로 생성됩니다. 수동 보강 등록은 지원하지 않습니다.</p>
      {failure ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">{failure}</p> : null}
      {success ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-900">{success}</p> : null}

      <section className="mt-8">
        <h2 className="text-2xl font-bold">진행 중</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {renderGroup("requested")}
          {renderGroup("scheduled")}
        </div>
      </section>

      <section className="mt-10 border-t border-[var(--line)] pt-8">
        <h2 className="text-2xl font-bold">처리 이력</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {renderGroup("completed")}
          {renderGroup("cancelled")}
        </div>
      </section>
    </main>
  );
}
