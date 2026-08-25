"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type RefObject } from "react";

const INPUT_CLASS = "h-13 w-full rounded-xl border border-[#9badaa] bg-white px-3 text-center font-mono text-base outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600";
const YEAR_OPTIONS = Array.from({ length: 100 }, (_, index) => String(2000 + index));
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const MINUTE_OPTIONS = ["00", "15", "30", "45"];

type Meridiem = "am" | "pm";
type TimeParts = { meridiem: Meridiem; hour: string; minute: string };

export type ScheduleDateTimeFieldsHandle = { validate: () => boolean };

type NumericComboboxProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  maxLength: number;
  onChange: (value: string) => void;
  onCommit: (value: string) => string;
  shouldAdvance: (value: string) => boolean;
  minimumAutoAdvanceLength?: number;
  nextRef?: RefObject<HTMLElement | null>;
  inputRef?: RefObject<HTMLInputElement | null>;
  onAdvance?: () => void;
  error?: boolean;
};

function focusNext(ref?: RefObject<HTMLElement | null>) {
  ref?.current?.focus();
}

function NumericCombobox({ id, label, value, options, maxLength, onChange, onCommit, shouldAdvance, minimumAutoAdvanceLength = 1, nextRef, inputRef, onAdvance, error }: NumericComboboxProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const latestRawValueRef = useRef(value);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    latestRawValueRef.current = value;
  }, [value]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function commit(next: string) {
    const committed = onCommit(next);
    latestRawValueRef.current = committed;
  }

  function advance(next: string) {
    commit(next);
    setOpen(false);
    if (onAdvance) onAdvance();
    else focusNext(nextRef);
  }

  function choose(option: string) {
    latestRawValueRef.current = option;
    onChange(option);
    advance(option);
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        ref={inputRef}
        id={id}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined}
        aria-invalid={error}
        maxLength={maxLength}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, maxLength);
          latestRawValueRef.current = next;
          onChange(next);
          if (next.length >= minimumAutoAdvanceLength && shouldAdvance(next)) {
            advance(next);
          }
        }}
        onBlur={() => {
          commit(latestRawValueRef.current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setHighlightedIndex((current) => {
              if (current < 0) return direction > 0 ? 0 : options.length - 1;
              return (current + direction + options.length) % options.length;
            });
            return;
          }
          if (event.key === "Enter" && open && highlightedIndex >= 0) {
            event.preventDefault();
            choose(options[highlightedIndex]);
          }
          if (event.key === "Tab") {
            setOpen(false);
          }
        }}
        className={INPUT_CLASS}
      />
      {open ? (
        <ul id={listboxId} role="listbox" className="absolute left-0 top-[calc(100%+0.375rem)] z-20 max-h-52 min-w-full overflow-y-auto rounded-xl border border-[#9badaa] bg-white p-1 shadow-[0_16px_40px_rgba(23,64,60,0.14)]">
          {options.map((option, index) => (
            <li key={option} id={`${listboxId}-${index}`} role="option" aria-selected={index === highlightedIndex}>
              <button type="button" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={`min-h-10 w-full rounded-lg px-3 text-left font-mono text-sm hover:bg-[#e5f2f0] ${index === highlightedIndex ? "bg-[#e5f2f0]" : ""}`}>{option}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function normalizeYear(value: string) {
  if (/^\d{2}$/.test(value) && value !== "20") return `20${value}`;
  return /^\d{4}$/.test(value) ? value : value;
}

function shouldAdvanceYear(rawValue: string) {
  if (rawValue.length === 1 || rawValue === "20" || rawValue.length === 3) return false;
  return /^\d{2}$/.test(rawValue) || /^\d{4}$/.test(rawValue);
}

function normalizeTwoDigits(value: string, min: number, max: number) {
  if (!/^\d{1,2}$/.test(value)) return value;
  const number = Number(value);
  return number >= min && number <= max ? String(number).padStart(2, "0") : value;
}

function normalizeHour(value: string) {
  if (!/^\d{1,2}$/.test(value)) return "";
  const number = Number(value);
  return number >= 1 && number <= 12 ? String(number).padStart(2, "0") : value;
}

function normalizeMinute(value: string) {
  if (!/^\d{1,2}$/.test(value)) return "";
  const number = Number(value);
  return number >= 0 && number <= 59 ? String(number).padStart(2, "0") : value;
}

function isValidHour(value: string) {
  return /^(0[1-9]|1[0-2])$/.test(value);
}

function isValidMinute(value: string) {
  return /^([0-5]\d)$/.test(value);
}

function shouldAdvanceHour(value: string) {
  return /^[2-9]$/.test(value) || isValidHour(value);
}

function shouldAdvanceMinute(value: string) {
  return /^[6-9]$/.test(value) || isValidMinute(value);
}

function isValidDate(year: string, month: string, day: string) {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return false;
  const candidate = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return !Number.isNaN(candidate.getTime())
    && candidate.getUTCFullYear() === Number(year)
    && candidate.getUTCMonth() + 1 === Number(month)
    && candidate.getUTCDate() === Number(day);
}

function canonicalDate(year: string, month: string, day: string) {
  const normalizedYear = normalizeYear(year);
  const normalizedMonth = normalizeTwoDigits(month, 1, 12);
  const normalizedDay = normalizeTwoDigits(day, 1, 31);
  return isValidDate(normalizedYear, normalizedMonth, normalizedDay) ? `${normalizedYear}-${normalizedMonth}-${normalizedDay}` : "";
}

function dateValidation(year: string, month: string, day: string) {
  const yearInvalid = !/^\d{4}$/.test(year);
  const monthInvalid = !/^(0[1-9]|1[0-2])$/.test(month);
  const dayRangeInvalid = !/^(0[1-9]|[12]\d|3[01])$/.test(day);
  const actualDateInvalid = !yearInvalid && !monthInvalid && !dayRangeInvalid && !isValidDate(year, month, day);
  return { yearInvalid, monthInvalid, dayInvalid: dayRangeInvalid || actualDateInvalid, valid: !yearInvalid && !monthInvalid && !dayRangeInvalid && !actualDateInvalid };
}

function parseDate(value: string) {
  const [year = "", month = "", day = ""] = value.split("-");
  return { year, month, day };
}

function parseTime(value: string): TimeParts {
  const [hourText, minuteText] = value.split(":");
  const hour24 = Number(hourText);
  if (!/^\d{2}:\d{2}$/.test(value) || hour24 > 23) return { meridiem: "pm", hour: "", minute: "" };
  return {
    meridiem: hour24 < 12 ? "am" : "pm",
    hour: String(hour24 % 12 || 12).padStart(2, "0"),
    minute: minuteText,
  };
}

function to24Hour(parts: TimeParts) {
  if (!isValidHour(parts.hour) || !isValidMinute(parts.minute)) return "";
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const hour24 = parts.meridiem === "am" ? hour % 12 : hour % 12 + 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function oneHourAfter(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const nextMinutes = hour * 60 + minute + 60;
  if (nextMinutes >= 24 * 60) return null;
  return `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}`;
}

type DateFieldsHandle = { validate: () => boolean };

const DateFields = forwardRef<DateFieldsHandle, { initialDate: string; error?: string; nextRef: RefObject<HTMLSelectElement | null> }>(function DateFields({ initialDate, error, nextRef }, ref) {
  const initial = parseDate(initialDate);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);
  const [touched, setTouched] = useState({ year: false, month: false, day: false });
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [changed, setChanged] = useState(false);
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const value = canonicalDate(year, month, day);
  const validation = dateValidation(year, month, day);
  const showYearError = validation.yearInvalid && (showAllErrors || touched.year);
  const showMonthError = validation.monthInvalid && month.length !== 1 && (showAllErrors || touched.month || month.length === 2);
  const showDayError = validation.dayInvalid && day.length !== 1 && (showAllErrors || touched.day || day.length === 2);
  const clientError = showYearError
    ? "연도를 4자리로 입력해 주세요."
    : showMonthError
      ? "월은 01~12 사이로 입력해 주세요."
      : showDayError
        ? "유효한 날짜를 입력해 주세요."
        : undefined;
  const displayedError = clientError ?? (!changed ? error : undefined);

  useImperativeHandle(ref, () => ({
    validate() {
      setShowAllErrors(true);
      return validation.valid;
    },
  }), [validation.valid]);

  function changeYear(next: string) {
    setChanged(true);
    setYear(next);
  }

  function changeMonth(next: string) {
    setChanged(true);
    setMonth(next);
  }

  function changeDay(next: string) {
    setChanged(true);
    setDay(next);
  }

  return (
    <fieldset>
      <legend className="text-sm font-bold">날짜</legend>
      <input type="hidden" name="date" value={value} />
      <div className="mt-2 flex max-w-xl items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(4.5rem,1.3fr)_auto_minmax(3rem,0.8fr)_auto_minmax(3rem,0.8fr)_auto] items-center gap-1 sm:gap-2">
          <NumericCombobox id="schedule-date-year" label="연도" value={year} options={YEAR_OPTIONS} maxLength={4} onChange={changeYear} onCommit={(next) => { const normalized = normalizeYear(next); setTouched((current) => ({ ...current, year: true })); setYear(normalized); return normalized; }} shouldAdvance={shouldAdvanceYear} minimumAutoAdvanceLength={2} nextRef={monthRef} error={showYearError} />
          <span aria-hidden="true" className="font-bold text-[var(--muted)]">년</span>
          <NumericCombobox id="schedule-date-month" label="월" value={month} options={MONTH_OPTIONS} maxLength={2} onChange={changeMonth} onCommit={(next) => { const normalized = normalizeTwoDigits(next, 1, 12); setTouched((current) => ({ ...current, month: true })); setMonth(normalized); return normalized; }} shouldAdvance={(next) => /^(0[1-9]|1[0-2])$/.test(next)} minimumAutoAdvanceLength={2} nextRef={dayRef} inputRef={monthRef} error={showMonthError} />
          <span aria-hidden="true" className="font-bold text-[var(--muted)]">월</span>
          <NumericCombobox id="schedule-date-day" label="일" value={day} options={DAY_OPTIONS} maxLength={2} onChange={changeDay} onCommit={(next) => { const normalized = normalizeTwoDigits(next, 1, 31); setTouched((current) => ({ ...current, day: true })); setDay(normalized); return normalized; }} shouldAdvance={(next) => /^(0[1-9]|[12]\d|3[01])$/.test(next)} minimumAutoAdvanceLength={2} nextRef={nextRef} inputRef={dayRef} error={showDayError} />
          <span aria-hidden="true" className="font-bold text-[var(--muted)]">일</span>
        </div>
        <div className="relative h-13">
          <input
            type="date"
            value={value}
            aria-label="달력에서 날짜 선택"
            onChange={(event) => {
              const selected = parseDate(event.target.value);
              setChanged(true);
              setTouched({ year: true, month: true, day: true });
              setYear(selected.year);
              setMonth(selected.month);
              setDay(selected.day);
            }}
            aria-invalid={Boolean(displayedError)}
            className="h-13 w-13 cursor-pointer rounded-xl border border-[#9badaa] bg-white px-2 text-transparent outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600"
          />
        </div>
      </div>
      {displayedError ? <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{displayedError}</p> : null}
    </fieldset>
  );
});

function TimeGroup({ prefix, label, value, onChange, onUserChange, meridiemRef, nextMeridiemRef, nextAfterMinute, serverError, groupError, showAllErrors }: { prefix: string; label: string; value: TimeParts; onChange: (value: TimeParts) => void; onUserChange: () => void; meridiemRef: RefObject<HTMLSelectElement | null>; nextMeridiemRef?: RefObject<HTMLSelectElement | null>; nextAfterMinute?: () => void; serverError?: string; groupError?: string; showAllErrors: boolean }) {
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const [hourTouched, setHourTouched] = useState(false);
  const [minuteTouched, setMinuteTouched] = useState(false);
  const [changed, setChanged] = useState(false);
  const hourInvalid = !isValidHour(value.hour);
  const minuteInvalid = !isValidMinute(value.minute);
  const showHourError = hourInvalid && value.hour.length !== 1 && (showAllErrors || hourTouched || value.hour.length === 2);
  const showMinuteError = minuteInvalid && value.minute.length !== 1 && (showAllErrors || minuteTouched || value.minute.length === 2);
  const displayedError = showHourError
    ? "시간은 01~12 사이로 입력해 주세요."
    : showMinuteError
      ? "분은 00~59 사이로 입력해 주세요."
      : groupError ?? (!changed ? serverError : undefined);

  function update(partial: Partial<TimeParts>) {
    setChanged(true);
    onUserChange();
    onChange({ ...value, ...partial });
  }

  return (
    <div className="min-w-0">
      <p className="mb-2 text-sm font-bold">{label}</p>
      <div className="grid grid-cols-[5.25rem_minmax(3.5rem,1fr)_auto_minmax(3.5rem,1fr)_auto] items-center gap-2">
        <select ref={meridiemRef} aria-label={`${label} 오전 또는 오후`} value={value.meridiem} onChange={(event) => { update({ meridiem: event.target.value as Meridiem }); focusNext(hourRef); }} className="h-13 rounded-xl border border-[#9badaa] bg-white px-2 text-base font-bold outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]">
          <option value="am">오전</option>
          <option value="pm">오후</option>
        </select>
        <NumericCombobox id={`${prefix}-hour`} label={`${label} 시`} value={value.hour} options={HOUR_OPTIONS} maxLength={2} onChange={(next) => update({ hour: next })} onCommit={(next) => { const normalized = normalizeHour(next); setHourTouched(true); onChange({ ...value, hour: normalized }); return normalized; }} shouldAdvance={shouldAdvanceHour} nextRef={minuteRef} inputRef={hourRef} error={showHourError} />
        <span aria-hidden="true" className="font-bold text-[var(--muted)]">시</span>
        <NumericCombobox id={`${prefix}-minute`} label={`${label} 분`} value={value.minute} options={MINUTE_OPTIONS} maxLength={2} onChange={(next) => update({ minute: next })} onCommit={(next) => { const normalized = normalizeMinute(next); setMinuteTouched(true); onChange({ ...value, minute: normalized }); return normalized; }} shouldAdvance={shouldAdvanceMinute} nextRef={nextMeridiemRef} inputRef={minuteRef} onAdvance={nextAfterMinute} error={showMinuteError} />
        <span aria-hidden="true" className="font-bold text-[var(--muted)]">분</span>
      </div>
      {displayedError ? <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{displayedError}</p> : null}
    </div>
  );
}

export const ScheduleDateTimeFields = forwardRef<ScheduleDateTimeFieldsHandle, { initialDate?: string; initialStartTime?: string; initialEndTime?: string; dateError?: string; startError?: string; endError?: string }>(function ScheduleDateTimeFields({ initialDate = "", initialStartTime = "", initialEndTime = "", dateError, startError, endError }, ref) {
  const [start, setStart] = useState(() => parseTime(initialStartTime));
  const [end, setEnd] = useState(() => parseTime(initialEndTime));
  const [showAllTimeErrors, setShowAllTimeErrors] = useState(false);
  const dateFieldsRef = useRef<DateFieldsHandle>(null);
  const endWasExplicitlyChanged = useRef(Boolean(initialStartTime && initialEndTime));
  const startMeridiemRef = useRef<HTMLSelectElement>(null);
  const endMeridiemRef = useRef<HTMLSelectElement>(null);
  const startTime = to24Hour(start);
  const endTime = to24Hour(end);
  const timeOrderInvalid = Boolean(startTime && endTime && endTime <= startTime);
  const orderError = timeOrderInvalid ? "종료 시간은 시작 시간보다 늦어야 합니다." : undefined;

  useImperativeHandle(ref, () => ({
    validate() {
      const dateValid = dateFieldsRef.current?.validate() ?? false;
      setShowAllTimeErrors(true);
      return dateValid && Boolean(startTime) && Boolean(endTime) && !timeOrderInvalid;
    },
  }), [endTime, startTime, timeOrderInvalid]);

  function changeStart(next: TimeParts) {
    setStart(next);
    if (!endWasExplicitlyChanged.current) {
      const suggestedEnd = oneHourAfter(to24Hour(next));
      if (suggestedEnd) setEnd(parseTime(suggestedEnd));
    }
  }

  return (
    <div className="grid gap-5">
      <DateFields ref={dateFieldsRef} initialDate={initialDate} error={dateError} nextRef={startMeridiemRef} />
      <fieldset>
        <legend className="text-sm font-bold">시간</legend>
        <input type="hidden" name="start_time" value={startTime} />
        <input type="hidden" name="end_time" value={endTime} />
        <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end">
          <TimeGroup prefix="schedule-start" label="시작 시간" value={start} onChange={changeStart} onUserChange={() => undefined} meridiemRef={startMeridiemRef} nextMeridiemRef={endMeridiemRef} serverError={startError} showAllErrors={showAllTimeErrors} />
          <span aria-hidden="true" className="hidden pb-3 font-bold text-[var(--muted)] lg:block">~</span>
          <TimeGroup prefix="schedule-end" label="종료 시간" value={end} onChange={setEnd} onUserChange={() => { endWasExplicitlyChanged.current = true; }} meridiemRef={endMeridiemRef} nextAfterMinute={() => document.getElementById("schedule-location")?.focus()} serverError={endError} groupError={orderError} showAllErrors={showAllTimeErrors} />
        </div>
      </fieldset>
    </div>
  );
});
