import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeMakeup, createMakeupRequest, deleteRequestedMakeup, scheduleMakeup } from "./actions";
import { MakeupReasonEditor } from "./makeup-reason-editor";

const STATUS_LABELS: Record<string, string> = {
  requested: "보강 대기",
  scheduled: "보강 예정",
  completed: "완료",
  cancelled: "취소",
};

type MakeupNotices = {
  error?: string;
  updated?: string;
  reasonUpdated?: string;
  deleted?: string;
};

function errorMessage(code?: string) {
  if (code === "reason_state") return "보강 상태가 변경되어 사유를 수정할 수 없습니다.";
  if (code === "reason") return "보강 사유를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "delete_state") return "보강 상태가 변경되어 삭제할 수 없습니다. 보강 대기 상태인지 확인해 주세요.";
  if (code === "delete") return "보강 대기를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "conflict") return "학생의 다른 일정과 시간이 겹쳐 보강 일정을 배정할 수 없습니다.";
  if (code === "program") return "원수업과 같은 프로그램의 일정을 선택해 주세요.";
  if (code === "attendance") return "대체 수업의 출결을 먼저 기록해 주세요.";
  if (code) return "보강 정보를 처리하지 못했습니다. 중복 요청과 현재 상태를 확인해 주세요.";
  return null;
}

export default async function MakeupPage({ searchParams }: { searchParams: Promise<MakeupNotices> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const notices = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [makeupsResult, studentsResult, lessonsResult] = await Promise.all([
    supabase.from("makeup_lessons").select("id, student_id, original_lesson_id, replacement_lesson_id, reason, status, created_at").order("created_at"),
    supabase.from("students").select("id, nickname").order("nickname"),
    supabase.from("lessons").select("id, title, starts_at, program_type, status").order("starts_at"),
  ]);
  if (makeupsResult.error || studentsResult.error || lessonsResult.error) {
    throw new Error("보강 정보를 불러오지 못했습니다.", { cause: makeupsResult.error ?? studentsResult.error ?? lessonsResult.error });
  }

  const makeups = makeupsResult.data;
  const students = studentsResult.data;
  const lessons = lessonsResult.data;
  const availableLessons = lessons.filter((lesson) => lesson.status !== "cancelled");
  const studentName = (id: string) => students.find((student) => student.id === id)?.nickname ?? "확인할 수 없는 학생";
  const lessonTitle = (id: string | null) => lessons.find((lesson) => lesson.id === id)?.title ?? "확인할 수 없는 일정";
  const failure = errorMessage(notices.error);
  const success = notices.deleted === "1"
    ? "보강 대기를 삭제했습니다."
    : notices.reasonUpdated === "1"
      ? "보강 사유를 저장했습니다."
      : notices.updated === "1"
        ? "보강 정보를 저장했습니다."
        : null;

  function renderGroup(status: string) {
    const items = makeups.filter((item) => item.status === status);
    return (
      <section key={status}>
        <h2 className="text-xl font-bold">{STATUS_LABELS[status]}</h2>
        {items.length ? (
          <ul className="mt-3 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
                <p className="font-bold">{studentName(item.student_id)}</p>
                <p className="mt-1 text-sm">원수업: {lessonTitle(item.original_lesson_id)}</p>
                {(status === "requested" || status === "scheduled") ? (
                  <MakeupReasonEditor makeupId={item.id} reason={item.reason} />
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{item.reason || "사유 없음"}</p>
                )}

                {status === "requested" ? (
                  <>
                    <form action={scheduleMakeup.bind(null, item.id)} className="mt-4 space-y-2">
                      <select name="replacement_lesson_id" required className="h-10 w-full rounded-lg border px-2">
                        {availableLessons.filter((lesson) => lesson.id !== item.original_lesson_id).map((lesson) => (
                          <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                        ))}
                      </select>
                      <button className="h-10 w-full rounded-lg border font-bold">일정 배정</button>
                      <Link href="/operator/schedules/new" className="block text-center text-sm font-bold underline">새 일정 생성</Link>
                    </form>
                    <form action={deleteRequestedMakeup.bind(null, item.id)} className="mt-3 border-t border-[var(--line)] pt-3 text-right">
                      <ConfirmSubmitButton message="이 보강 대기를 삭제할까요?" className="h-9 rounded-lg border border-rose-300 px-3 text-sm font-bold text-rose-800">
                        삭제
                      </ConfirmSubmitButton>
                    </form>
                  </>
                ) : status === "scheduled" ? (
                  <form action={completeMakeup.bind(null, item.id)} className="mt-4">
                    <p className="text-sm">대체: {lessonTitle(item.replacement_lesson_id)}</p>
                    <button className="mt-2 h-10 w-full rounded-lg border font-bold">출결 확인 후 완료</button>
                  </form>
                ) : item.replacement_lesson_id ? (
                  <p className="mt-3 text-sm">대체: {lessonTitle(item.replacement_lesson_id)}</p>
                ) : null}
              </li>
            ))}
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
      {failure ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">{failure}</p> : null}
      {success ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-900">{success}</p> : null}

      <form action={createMakeupRequest} className="mt-6 grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-5 sm:grid-cols-3">
        <select name="student_id" required className="h-11 rounded-xl border px-3">
          {students.map((student) => <option key={student.id} value={student.id}>{student.nickname}</option>)}
        </select>
        <select name="original_lesson_id" required className="h-11 rounded-xl border px-3">
          {availableLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
        </select>
        <input name="reason" placeholder="보강 사유" className="h-11 rounded-xl border px-3" />
        <button className="h-11 rounded-xl bg-[var(--accent)] font-bold text-white sm:col-span-3">보강 대기 등록</button>
      </form>

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
