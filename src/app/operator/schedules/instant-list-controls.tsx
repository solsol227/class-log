"use client";

import { useRouter } from "next/navigation";

type InstantListControlsProps = {
  categories: string[];
  month: string;
  staff: string;
  staffOptions: { id: string; name: string }[];
  sort: "asc" | "desc";
  statuses: string[];
};

export function InstantListControls({
  categories,
  month,
  staff,
  staffOptions,
  sort,
  statuses,
}: InstantListControlsProps) {
  const router = useRouter();

  function updateFilters(nextMonth: string, nextStaff: string, nextSort: "asc" | "desc") {
    const params = new URLSearchParams();
    categories.forEach((category) => params.append("category", category));
    statuses.forEach((status) => params.append("status", status));
    if (nextMonth) params.set("month", nextMonth);
    if (nextStaff) params.set("staff", nextStaff);
    if (nextSort !== "asc") params.set("sort", nextSort);

    const query = params.toString();
    router.push(query ? `/operator/schedules?${query}` : "/operator/schedules");
  }

  return (
    <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-3">
      <label className="min-w-0 text-sm font-bold">
        월 <span className="font-normal text-[var(--muted)]">(비우면 전체)</span>
        <input
          type="month"
          value={month}
          onChange={(event) => updateFilters(event.target.value, staff, sort)}
          className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3"
        />
      </label>
      <label className="min-w-0 text-sm font-bold">
        담당자
        <select
          value={staff}
          onChange={(event) => updateFilters(month, event.target.value, sort)}
          className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3"
        >
          <option value="">담당자 전체</option>
          {staffOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-bold">
        정렬
        <select
          value={sort}
          onChange={(event) => updateFilters(month, staff, event.target.value as "asc" | "desc")}
          className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3"
        >
          <option value="asc">일정 빠른순</option>
          <option value="desc">일정 늦은순</option>
        </select>
      </label>
    </div>
  );
}
