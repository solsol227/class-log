import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import Link from "next/link";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteStaff, restoreStaff, updateStaff } from "./actions";
import { StaffCreateForm } from "./staff-create-form";

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
  const access = await requireOperatorAccess();
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

      {access.canManageStaff ? <StaffCreateForm /> : <p className="mt-5 rounded-xl bg-[#f4f8f7] p-4 text-sm text-[var(--muted)]">직원 기본정보를 조회할 수 있습니다. 등록·수정·삭제와 로그인 계정 관리는 owner만 가능합니다.</p>}

      {activeStaff.length ? (
        <ul className="mt-6 space-y-3">
          {activeStaff.map((member) => (
            <li key={member.id} className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <Link href={`/operator/staff/${member.id}`} className="mb-4 flex items-center justify-between gap-3 font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">
                <span>{member.display_name}</span>
                <span>상세 보기 →</span>
              </Link>
              {access.canManageStaff ? <><form id={`staff-update-${member.id}`} action={updateStaff.bind(null, member.id)} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)] sm:items-center">
                  <input name="display_name" defaultValue={member.display_name} required className="h-11 rounded-xl border border-[#9badaa] px-3" />
                  <select name="role" defaultValue={member.role} required className="h-11 rounded-xl border border-[#9badaa] bg-white px-3">
                    <option value="manager">매니저</option>
                    <option value="vocal_trainer">보컬트레이너</option>
                  </select>
              </form>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="submit" form={`staff-update-${member.id}`} className="min-h-11 min-w-0 rounded-xl bg-[var(--accent)] px-3 font-bold text-white transition hover:bg-[var(--accent-strong)]">저장</button>
                <form action={deleteStaff.bind(null, member.id)} className="min-w-0">
                  <ConfirmSubmitButton message="이 직원을 삭제할까요? 직원 정보와 과거 기록은 보존되며 삭제된 직원으로 이동합니다." className="min-h-11 w-full min-w-0 rounded-xl border border-rose-300 bg-white px-3 font-bold text-rose-800 transition hover:bg-rose-50">
                    삭제
                  </ConfirmSubmitButton>
                </form>
              </div></> : <p className="text-sm text-[var(--muted)]">{ROLE_LABELS[member.role] ?? member.role}</p>}
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
                {access.canManageStaff ? <form action={restoreStaff.bind(null, member.id)}>
                  <button className="h-10 rounded-xl border border-[var(--accent)] px-4 font-bold">복원</button>
                </form> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}
