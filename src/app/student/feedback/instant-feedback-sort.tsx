"use client";

import { useRouter } from "next/navigation";

export function InstantFeedbackSort({ range, sort }: { range: string; sort: "asc" | "desc" }) {
  const router = useRouter();

  return (
    <select
      aria-label="피드백 정렬"
      value={sort}
      onChange={(event) => {
        const params = new URLSearchParams({ range, sort: event.target.value });
        router.push(`/student/feedback?${params.toString()}`);
      }}
      className="min-h-11 shrink-0 rounded-xl border border-[var(--line)] bg-white px-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <option value="desc">최신 수업순</option>
      <option value="asc">오래된 수업순</option>
    </select>
  );
}
