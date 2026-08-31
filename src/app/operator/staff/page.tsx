import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStaff, deleteStaff, restoreStaff, updateStaff } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  manager: "매니저",
  vocal_trainer: "보컬트레이너",
};

type StaffNoticeParams = {
  created?: string;
  updated?: string;
  deleted?: string;
  restored?: string;
  error?: string;
};

function successMessage(notices: StaffNoticeParams) {
  if (notices.created === "1") return "직원을 등록했습니다.";
  if (notices.updated === "1") return "직원 정보를 저장했습니다.";
  if (notices.deleted === "archived") return "과거 기록을 보존하고 직원을 삭제된 직원으로 이동했습니다.";
  if (notices.restored === "1") return "직원을 복원했습니다.";
  return null;
}

function errorMessage(code?: string) {
  if (code === "delete") return "직원을 삭제하지 못했습니다. 다른 요청에서 상태가 변경되었을 수 있습니다.";
  if (code === "restore") return "직원을 복원하지 못했습니다. 현재 상태를 확인해 주세요.";
  if (code === "invalid") return "직원 이름과 역할을 다시 확인해 주세요.";
  if (code) return "직원 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return null;
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<StaffNoticeParams> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const notices = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: staff, error } = await supabase
    .from("staff_profiles")
    .select("id, display_name, role, is_active")
    .order("display_name");
  if (error) throw new Error("직원 목록을 불러오지 못했습니다.", { cause: error });

  const activeStaff = staff.filter((member) => member.is_active);
  const deletedStaff = staff.filter((member) => !member.is_active);
  const success = successMessage(notices);
  const failure = errorMessage(notices.error);

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <h1 className="text-3xl font-bold">직원관리</h1>
      {failure ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">{failure}</p> : null}
      {success ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-900">{success}</p> : null}

      <form action={createStaff} className="mt-6 grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-5 sm:grid-cols-[1fr_1fr_auto]">
        <input name="display_name" required placeholder="직원 이름" className="h-12 rounded-xl border border-[#9badaa] px-4" />
        <select name="role" required className="h-12 rounded-xl border border-[#9badaa] bg-white px-4">
          <option value="manager">매니저</option>
          <option value="vocal_trainer">보컬트레이너</option>
        </select>
        <button className="rounded-xl bg-[var(--accent)] px-5 font-bold text-white">직원 등록</button>
      </form>

      {activeStaff.length ? (
        <ul className="mt-6 space-y-3">
          {activeStaff.map((member) => (
            <li key={member.id} className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <Link href={`/operator/staff/${member.id}`} className="mb-4 flex items-center justify-between gap-3 font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">
                <span>{member.display_name}</span>
                <span>상세 보기 →</span>
              </Link>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto] sm:items-center">
                <form action={updateStaff.bind(null, member.id)} className="contents">
                  <input name="display_name" defaultValue={member.display_name} required className="h-11 rounded-xl border border-[#9badaa] px-3" />
                  <select name="role" defaultValue={member.role} required className="h-11 rounded-xl border border-[#9badaa] bg-white px-3">
                    <option value="manager">매니저</option>
                    <option value="vocal_trainer">보컬트레이너</option>
                  </select>
                  <button className="h-11 rounded-xl border border-[var(--accent)] px-4 font-bold">저장</button>
                </form>
              </div>
              <form action={deleteStaff.bind(null, member.id)} className="mt-3 flex justify-end">
                <ConfirmSubmitButton message="이 직원을 삭제할까요? 직원 정보와 과거 기록은 보존되며 삭제된 직원으로 이동합니다." className="h-10 rounded-xl border border-rose-300 px-4 font-bold text-rose-800">
                  삭제
                </ConfirmSubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 text-[var(--muted)]">등록된 직원이 없습니다.</p>
      )}

      {deletedStaff.length ? (
        <details className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-5">
          <summary className="cursor-pointer font-bold">삭제된 직원 {deletedStaff.length}명</summary>
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {deletedStaff.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/operator/staff/${member.id}`} className="font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">{member.display_name}</Link>
                  <p className="text-sm text-[var(--muted)]">{ROLE_LABELS[member.role] ?? member.role}</p>
                </div>
                <form action={restoreStaff.bind(null, member.id)}>
                  <button className="h-10 rounded-xl border border-[var(--accent)] px-4 font-bold">복원</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}
