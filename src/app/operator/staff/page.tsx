import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStaff, updateStaff } from "./actions";

const ROLE_LABELS: Record<string,string> = { manager: "매니저", vocal_trainer: "보컬트레이너" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ created?: string; updated?: string; error?: string }> }) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const notices = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: staff, error } = await supabase.from("staff_profiles").select("id, display_name, role, is_active").order("display_name");
  if (error) throw new Error("직원 목록을 불러오지 못했습니다.", { cause: error });
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8"><h1 className="text-3xl font-bold">직원관리</h1>{notices.error ? <p className="mt-4 rounded-xl bg-rose-50 p-4 font-bold text-rose-900">직원 정보를 저장하지 못했습니다.</p> : notices.created || notices.updated ? <p className="mt-4 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-900">직원 정보를 저장했습니다.</p> : null}<form action={createStaff} className="mt-6 grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-5 sm:grid-cols-[1fr_1fr_auto]"><input name="display_name" required placeholder="직원 이름" className="h-12 rounded-xl border border-[#9badaa] px-4"/><select name="role" required className="h-12 rounded-xl border border-[#9badaa] bg-white px-4"><option value="manager">매니저</option><option value="vocal_trainer">보컬트레이너</option></select><button className="rounded-xl bg-[var(--accent)] px-5 font-bold text-white">직원 등록</button></form><ul className="mt-6 space-y-3">{staff.map((member) => <li key={member.id} className="rounded-2xl border border-[var(--line)] bg-white p-5"><form action={updateStaff.bind(null, member.id)} className="flex flex-wrap items-center gap-3"><input name="display_name" defaultValue={member.display_name} required className="h-11 min-w-52 flex-1 rounded-xl border border-[#9badaa] px-3"/><span className="font-bold">{ROLE_LABELS[member.role] ?? member.role}</span><label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={member.is_active}/>활성</label><button className="h-11 rounded-xl border border-[var(--accent)] px-4 font-bold">저장</button></form></li>)}</ul></main>;
}
