import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addStudentComment } from "./actions";

export default async function StudentFeedbackPage({ searchParams }: { searchParams: Promise<{ error?: string; commented?: string }> }) {
  await requireAuthenticatedUser("/login/student", "student");
  const notices = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: feedback, error }, { data: comments }] = await Promise.all([supabase.from("lesson_feedback").select("id, lesson_id, author_staff_id, body, published_at").order("published_at", { ascending: false }), supabase.from("feedback_comments").select("id, feedback_id, parent_comment_id, body, created_at").order("created_at")]);
  if (error) throw new Error("피드백을 불러오지 못했습니다.", { cause: error });
  const lessonIds = [...new Set((feedback ?? []).map((item) => item.lesson_id))];
  const staffIds = [...new Set((feedback ?? []).map((item) => item.author_staff_id))];
  const [{ data: lessons }, { data: staff }] = await Promise.all([lessonIds.length ? supabase.from("lessons").select("id, title").in("id", lessonIds) : { data: [] }, staffIds.length ? supabase.from("staff_profiles").select("id, display_name").in("id", staffIds) : { data: [] }]);
  return <main className="mx-auto w-full max-w-3xl px-5 py-10"><h1 className="text-3xl font-bold">내 피드백</h1>{notices.error ? <p className="mt-4 text-rose-800">댓글을 저장하지 못했습니다.</p> : null}{feedback?.length ? <ul className="mt-6 space-y-5">{feedback.map((item) => <li key={item.id} className="rounded-2xl border border-[var(--line)] bg-white p-6"><p className="text-sm font-bold text-[var(--accent-strong)]">{lessons?.find((lesson) => lesson.id === item.lesson_id)?.title}</p><p className="mt-3 whitespace-pre-wrap leading-7">{item.body}</p><p className="mt-2 text-sm text-[var(--muted)]">제공: {staff?.find((member) => member.id === item.author_staff_id)?.display_name ?? "담당자"}</p><ul className="mt-4 space-y-2">{(comments ?? []).filter((comment) => comment.feedback_id === item.id).map((comment) => <li key={comment.id} className="rounded-lg bg-[#f4f8f7] p-3"><p>{comment.body}</p><form action={addStudentComment.bind(null, item.id)} className="mt-2 flex gap-2"><input type="hidden" name="parent_comment_id" value={comment.id}/><input name="body" required placeholder="답글" className="h-9 flex-1 rounded-lg border px-2"/><button className="rounded-lg border px-3 text-sm font-bold">답글</button></form></li>)}</ul><form action={addStudentComment.bind(null, item.id)} className="mt-4 flex gap-2"><input name="body" required placeholder="댓글을 입력하세요" className="h-10 flex-1 rounded-lg border px-3"/><button className="rounded-lg bg-[var(--accent)] px-4 font-bold text-white">등록</button></form></li>)}</ul> : <p className="mt-6 rounded-2xl border bg-white p-6 text-[var(--muted)]">게시된 피드백이 없습니다.</p>}</main>;
}
