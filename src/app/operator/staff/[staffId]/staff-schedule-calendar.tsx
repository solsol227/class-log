"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ScheduleStatus = "draft" | "scheduled" | "completed" | "cancelled";

export type StaffScheduleItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: ScheduleStatus;
  statusLabel: string;
  studentNames: string[];
};

type CalendarDay = {
  key: string;
  day: number;
  isCurrentMonth: boolean;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Seoul",
});
const KST_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Seoul",
});
const KST_COMPACT_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});
const KST_LONG_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

const STATUS_DOT_CLASS: Record<ScheduleStatus, string> = {
  draft: "bg-amber-500",
  scheduled: "bg-[var(--accent)]",
  completed: "bg-slate-500",
  cancelled: "bg-rose-500",
};

const STATUS_BADGE_CLASS: Record<ScheduleStatus, string> = {
  draft: "bg-amber-50 text-amber-800",
  scheduled: "bg-[#e5f2f0] text-[var(--accent-strong)]",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-rose-50 text-rose-800",
};

function dateKey(value: string) {
  return KST_DATE_FORMATTER.format(new Date(value));
}

function formatScheduleRange(startsAt: string, endsAt: string) {
  const startDate = KST_LONG_DATE_FORMATTER.format(new Date(startsAt));
  const startTime = KST_TIME_FORMATTER.format(new Date(startsAt));
  const endTime = KST_TIME_FORMATTER.format(new Date(endsAt));
  if (dateKey(startsAt) === dateKey(endsAt)) return `${startDate} ${startTime} ~ ${endTime}`;
  return `${startDate} ${startTime} ~ ${KST_LONG_DATE_FORMATTER.format(new Date(endsAt))} ${endTime}`;
}

function assignedStudentLabel(names: string[], limit: number) {
  if (names.length === 0) return "없음";
  const visibleNames = names.slice(0, limit).join(", ");
  return names.length > limit ? `${visibleNames} 외 ${names.length - limit}명` : visibleNames;
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildCalendarDays(month: string): CalendarDay[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    return { key, day: date.getUTCDate(), isCurrentMonth: date.getUTCMonth() === monthNumber - 1 };
  });
}

function ScheduleLine({ schedule }: { schedule: StaffScheduleItem }) {
  const time = KST_COMPACT_TIME_FORMATTER.format(new Date(schedule.startsAt));
  const label = `${schedule.title}, ${time}, 학생 ${schedule.studentNames.length}명, 상태 ${schedule.statusLabel}`;
  return (
    <Link
      href={`/operator/schedules/${schedule.id}`}
      aria-label={label}
      title={label}
      className="mt-1 flex min-w-0 items-center gap-1 rounded-md bg-[#f4f8f7] px-1.5 py-1 text-[10px] font-bold leading-tight text-[var(--foreground)] transition hover:bg-[#e5f2f0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] sm:text-xs"
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[schedule.status]}`} />
      <span className="min-w-0 truncate">{time}</span>
      <span className="ml-auto shrink-0">{schedule.studentNames.length}명</span>
      <span className="sr-only">{schedule.statusLabel}</span>
    </Link>
  );
}

export function StaffScheduleCalendar({ staffId, month, schedules, now }: { staffId: string; month: string; schedules: StaffScheduleItem[]; now: number }) {
  const router = useRouter();
  const monthInputRef = useRef<HTMLInputElement>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthLabel = `${year}년 ${monthNumber}월`;
  const calendarDays = buildCalendarDays(month);
  const schedulesByDate = schedules.reduce<Map<string, StaffScheduleItem[]>>((itemsByDate, schedule) => {
    const key = dateKey(schedule.startsAt);
    const items = itemsByDate.get(key) ?? [];
    items.push(schedule);
    itemsByDate.set(key, items);
    return itemsByDate;
  }, new Map());
  const upcomingSchedules = schedules.filter((schedule) => new Date(schedule.endsAt).getTime() > now);
  const expandedSchedules = expandedDate ? schedulesByDate.get(expandedDate) ?? [] : [];

  function selectMonth(nextMonth: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
    router.push(`/operator/staff/${staffId}?month=${nextMonth}`);
  }

  function openMonthPicker() {
    const input = monthInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  }

  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">담당 일정</h2>
        <div className="relative flex items-center gap-1" aria-label="조회 월 이동">
          <Link href={`/operator/staff/${staffId}?month=${shiftMonth(month, -1)}`} aria-label="이전 달 보기" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] text-2xl font-bold text-[var(--accent-strong)] hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">‹</Link>
          <strong className="min-w-32 text-center text-lg" aria-live="polite">{monthLabel}</strong>
          <Link href={`/operator/staff/${staffId}?month=${shiftMonth(month, 1)}`} aria-label="다음 달 보기" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] text-2xl font-bold text-[var(--accent-strong)] hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">›</Link>
          <button type="button" onClick={openMonthPicker} aria-label="조회할 월 선택" title="조회할 월 선택" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--accent-strong)] hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M6 2v4M18 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /></svg>
          </button>
          <input ref={monthInputRef} type="month" value={month} onChange={(event) => selectMonth(event.target.value)} aria-label="조회할 월" className="pointer-events-none absolute right-0 top-full h-px w-px opacity-0" />
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(15rem,0.78fr)_minmax(0,1.45fr)] lg:items-start">
        <div className="order-2 lg:order-1">
          <h3 className="text-lg font-bold">예정 일정</h3>
          {upcomingSchedules.length ? (
            <ul className="mt-3 space-y-2">
              {upcomingSchedules.map((schedule) => (
                <li key={schedule.id}>
                  <Link href={`/operator/schedules/${schedule.id}`} className="block rounded-xl border border-[var(--line)] p-3 transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:p-4">
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0 font-bold leading-snug">{schedule.title}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE_CLASS[schedule.status]}`}>{schedule.statusLabel}</span>
                    </span>
                    <time dateTime={schedule.startsAt} className="mt-1.5 block text-sm text-[var(--muted)]">{formatScheduleRange(schedule.startsAt, schedule.endsAt)}</time>
                    <span className="mt-1.5 block text-sm"><span className="font-bold">배정 학생:</span>{" "}<span className="sm:hidden">{assignedStudentLabel(schedule.studentNames, 2)}</span><span className="hidden sm:inline">{assignedStudentLabel(schedule.studentNames, 3)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-[var(--muted)]">선택한 월에 예정된 담당 일정이 없습니다.</p>}
        </div>

        <div className="order-1 min-w-0 lg:order-2">
          <h3 className="text-lg font-bold">월간 캘린더</h3>
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)]">
            <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[#f4f8f7] text-center text-xs font-bold sm:text-sm">
              {WEEKDAYS.map((weekday, index) => <div key={weekday} className={`py-2 ${index === 0 ? "text-rose-700" : index === 6 ? "text-blue-700" : ""}`}>{weekday}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, index) => {
                const daySchedules = day.isCurrentMonth ? schedulesByDate.get(day.key) ?? [] : [];
                const hiddenCount = Math.max(0, daySchedules.length - 2);
                return (
                  <div key={day.key} className={`min-h-20 min-w-0 border-b border-r border-[var(--line)] p-1 last:border-r-0 sm:min-h-28 sm:p-2 ${index % 7 === 6 ? "border-r-0" : ""} ${index >= 35 ? "border-b-0" : ""} ${day.isCurrentMonth ? "bg-white" : "bg-[#f8faf9] text-[var(--muted)] opacity-45"}`}>
                    <span className={`block text-xs font-bold sm:text-sm ${index % 7 === 0 ? "text-rose-700" : index % 7 === 6 ? "text-blue-700" : ""}`}>{day.day}</span>
                    {daySchedules.slice(0, 2).map((schedule) => <ScheduleLine key={schedule.id} schedule={schedule} />)}
                    {hiddenCount > 0 ? <button type="button" onClick={() => setExpandedDate(day.key)} aria-label={`${day.day}일 일정 ${hiddenCount}개 더 보기`} className="mt-1 w-full rounded-md px-1 py-1 text-left text-[10px] font-bold text-[var(--accent-strong)] hover:bg-[#e5f2f0] focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:text-xs">+{hiddenCount}</button> : null}
                  </div>
                );
              })}
            </div>
          </div>

          {expandedDate ? (
            <section aria-label={`${Number(expandedDate.slice(-2))}일 전체 일정`} className="mt-3 rounded-xl bg-[#f4f8f7] p-3">
              <div className="flex items-center justify-between gap-3"><h4 className="font-bold">{monthNumber}월 {Number(expandedDate.slice(-2))}일 전체 일정</h4><button type="button" onClick={() => setExpandedDate(null)} className="min-h-9 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-bold">닫기</button></div>
              <ul className="mt-2 space-y-1">{expandedSchedules.map((schedule) => <li key={schedule.id}><ScheduleLine schedule={schedule} /></li>)}</ul>
            </section>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--muted)]" aria-label="일정 상태 범례">
            {(["draft", "scheduled", "completed", "cancelled"] as const).map((status) => {
              const label = { draft: "Draft", scheduled: "예정", completed: "완료", cancelled: "취소" }[status];
              return <span key={status} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />{label}</span>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
