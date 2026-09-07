import { scheduleCategoryLabel } from "@/lib/lessons/category";

export function ScheduleCategoryBadge({ category }: { category: string | null }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${category ? "border-[#cce2df] bg-[#f4f8f7] text-[var(--accent-strong)]" : "border-dashed border-[var(--line)] bg-stone-50 text-[var(--muted)]"}`}>{scheduleCategoryLabel(category)}</span>;
}
