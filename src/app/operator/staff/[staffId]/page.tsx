import Link from "next/link";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { getLessonDisplayStatusLabel } from "@/lib/lessons/display-status";
import { syncElapsedLessonStatuses } from "@/lib/lessons/sync-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateStaffAccountForm, ResetStaffPasswordForm } from "../staff-account-forms";
import { reactivateStaffAccount, suspendStaffAccount } from "../actions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_LABELS: Record<string, string> = { manager: "매니저", vocal_trainer: "보컬트레이너" };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function summarize(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}…` : compact;
}

function StaffUnavailable() {
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-2xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-bold">직원 정보를 찾을 수 없습니다.</h1>
        <Link href="/operator/staff" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--accent)] px-5 font-bold text-white">직원 목록</Link>
      </section>
    </main>
  );
}

type AccountNotices = { accountCreated?: string; passwordReset?: string; accountStatus?: string; accountError?: string };

export default async function StaffDetailPage({ params, searchParams }: { params: Promise<{ staffId: string }>; searchParams: Promise<AccountNotices> }) {
  const access = await requireOperatorAccess();
  const { staffId } = await params;
  const accountNotices = await searchParams;
  if (!UUID_PATTERN.test(staffId)) return <StaffUnavailable />;

  const supabase = await createSupabaseServerClient();
  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles")
    .select("id, display_name, role, is_active")
    .eq("id", staffId)
    .maybeSingle();
  if (staffError || !staff) return <StaffUnavailable />;

  let account: { login_id: string; is_login_enabled: boolean } | null = null;
  if (access.canManageAccounts) {
    const { data: privateStaff } = await supabase.from("staff_profiles").select("auth_user_id").eq("id", staffId).maybeSingle();
    if (privateStaff?.auth_user_id) {
      const { data } = await supabase.from("operator_accounts").select("login_id, is_login_enabled").eq("auth_user_id", privateStaff.auth_user_id).eq("access_level", "staff").maybeSingle();
      account = data;
    }
  }

  const [lessonStaffResult, feedbackResult] = await Promise.all([
    supabase.from("lesson_staff").select("lesson_id, role, created_at").eq("staff_id", staffId),
    supabase.from("lesson_feedback").select("id, lesson_id, student_id, body, created_at").eq("author_staff_id", staffId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  if (lessonStaffResult.error || feedbackResult.error) {
    throw new Error("직원 활동 기록을 불러오지 못했습니다.", { cause: lessonStaffResult.error ?? feedbackResult.error });
  }

  const lessonIds = [...new Set([
    ...lessonStaffResult.data.map((entry) => entry.lesson_id),
    ...feedbackResult.data.map((entry) => entry.lesson_id),
  ])];
  const studentIds = [...new Set(feedbackResult.data.map((entry) => entry.student_id))];
  const [lessonsResult, studentsResult] = await Promise.all([
    lessonIds.length
      ? supabase.from("lessons").select("id, title, starts_at, ends_at, status").in("id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? supabase.from("students").select("id, nickname").in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lessonsResult.error || studentsResult.error) {
    throw new Error("직원 활동 상세를 불러오지 못했습니다.", { cause: lessonsResult.error ?? studentsResult.error });
  }
  if (access.isOwner) await syncElapsedLessonStatuses(supabase, lessonsResult.data.map((lesson) => lesson.id));

  const lessonById = new Map(lessonsResult.data.map((lesson) => [lesson.id, lesson]));
  const studentById = new Map(studentsResult.data.map((student) => [student.id, student.nickname]));
  const schedules = lessonStaffResult.data
    .map((entry) => ({ ...entry, lesson: lessonById.get(entry.lesson_id) }))
    .filter((entry): entry is typeof entry & { lesson: NonNullable<typeof entry.lesson> } => Boolean(entry.lesson))
    .sort((a, b) => new Date(a.lesson.starts_at).getTime() - new Date(b.lesson.starts_at).getTime());
  // This authenticated Server Component evaluates once per request.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const upcomingSchedules = schedules.filter((entry) => new Date(entry.lesson.ends_at).getTime() > requestTime);
  const pastSchedules = schedules.filter((entry) => new Date(entry.lesson.ends_at).getTime() <= requestTime).reverse();

  function scheduleList(items: typeof schedules, emptyMessage: string) {
    if (!items.length) return <p className="mt-4 text-[var(--muted)]">{emptyMessage}</p>;
    return (
      <ul className="mt-4 space-y-3">
        {items.map((entry) => (
          <li key={`${entry.lesson_id}-${entry.role}`}>
            <Link href={`/operator/schedules/${entry.lesson_id}`} className="block rounded-xl border border-[var(--line)] p-4 transition hover:border-[var(--accent)]">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{entry.lesson.title}</span>
                <span className="text-sm font-bold text-[var(--accent-strong)]">{getLessonDisplayStatusLabel(entry.lesson.status, entry.lesson.ends_at, requestTime)}</span>
              </span>
              <span className="mt-2 block text-sm text-[var(--muted)]">{formatDateTime(entry.lesson.starts_at)} ~ {formatDateTime(entry.lesson.ends_at)}</span>
              <span className="mt-2 block text-sm">당시 역할 {ROLE_LABELS[entry.role] ?? entry.role}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <Link href="/operator/staff" className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">직원 목록</Link>
      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--accent-strong)]">직원 정보</p>
            <h1 className="mt-3 text-3xl font-bold">{staff.display_name}</h1>
            <p className="mt-2 text-[var(--muted)]">{ROLE_LABELS[staff.role] ?? staff.role}</p>
          </div>
          {!staff.is_active ? <span className="rounded-full bg-[#f3e8e6] px-3 py-1 text-sm font-bold text-rose-800">삭제된 직원</span> : null}
        </div>
      </section>

      {access.canManageAccounts ? <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h2 className="text-2xl font-bold">로그인 계정</h2>
        {accountNotices.accountCreated === "1" ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">로그인 계정을 만들었습니다. 초기 비밀번호는 이 화면을 떠난 뒤 다시 볼 수 없습니다.</p> : null}
        {accountNotices.passwordReset === "1" ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">비밀번호를 재설정했습니다.</p> : null}
        {accountNotices.accountStatus ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">로그인 상태를 {accountNotices.accountStatus === "enabled" ? "재활성화" : "중지"}했습니다.</p> : null}
        {accountNotices.accountError ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 font-bold text-rose-900">{accountNotices.accountError === "invalid_id" ? "로그인 아이디 형식을 확인해 주세요." : accountNotices.accountError === "duplicate" ? "이미 사용 중인 로그인 아이디입니다." : accountNotices.accountError === "password" ? "비밀번호는 8자 이상이며 확인 입력과 같아야 합니다." : "계정 상태를 처리하지 못했습니다. 다시 시도해 주세요."}</p> : null}
        {!account ? <>
          <p className="mt-3 font-bold">상태: 계정 없음</p>
          {staff.is_active ? <CreateStaffAccountForm staffId={staffId} /> : <p className="mt-3 text-[var(--muted)]">삭제된 직원은 복원한 뒤 계정을 만들 수 있습니다.</p>}
        </> : <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm font-bold text-[var(--muted)]">상태</dt><dd className="mt-1 font-bold">{account.is_login_enabled && staff.is_active ? "사용 중" : "로그인 중지"}</dd></div><div><dt className="text-sm font-bold text-[var(--muted)]">로그인 아이디</dt><dd className="mt-1 font-mono font-bold">{account.login_id}</dd></div></dl>
          <ResetStaffPasswordForm staffId={staffId} />
          <form action={(account.is_login_enabled ? suspendStaffAccount : reactivateStaffAccount).bind(null, staffId)} className="mt-4"><button className="min-h-11 rounded-xl border border-[var(--line)] px-4 font-bold">{account.is_login_enabled ? "로그인 중지" : "로그인 재활성화"}</button></form>
        </>}
      </section> : null}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h2 className="text-2xl font-bold">담당 일정</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div><h3 className="text-lg font-bold">예정 일정</h3>{scheduleList(upcomingSchedules, "예정된 담당 일정이 없습니다.")}</div>
          <div><h3 className="text-lg font-bold">지난 일정</h3>{scheduleList(pastSchedules, "지난 담당 일정이 없습니다.")}</div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-8">
        <h2 className="text-2xl font-bold">피드백</h2>
        {feedbackResult.data.length ? (
          <ul className="mt-5 space-y-3">
            {feedbackResult.data.map((feedback) => {
              const lesson = lessonById.get(feedback.lesson_id);
              return (
                <li key={feedback.id} className="rounded-xl border border-[var(--line)] p-4">
                  <Link href={`/operator/schedules/${feedback.lesson_id}`} className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">{lesson?.title ?? "확인할 수 없는 일정"}</Link>
                  <p className="mt-2 text-sm text-[var(--muted)]">{studentById.get(feedback.student_id) ?? "확인할 수 없는 학생"} · 일정 {lesson ? formatDate(lesson.starts_at) : "날짜 확인 불가"} · 작성 {formatDate(feedback.created_at)}</p>
                  <p className="mt-3 leading-7">{summarize(feedback.body)}</p>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-4 text-[var(--muted)]">작성한 피드백이 없습니다.</p>}
      </section>
    </main>
  );
}
