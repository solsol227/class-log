"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export type AssignmentPickerOption = {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  disabledLabel?: string;
};

type AssignmentSearchPickerProps = {
  title: string;
  searchLabel: string;
  searchPlaceholder: string;
  inputName: string;
  options: AssignmentPickerOption[];
  formAction: (formData: FormData) => void;
  formError?: string;
  emptyMessage?: string;
  submitLabel: string;
};

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function AssignButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-10 shrink-0 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "배정 중" : label}
    </button>
  );
}

export function AssignmentSearchPicker({
  title,
  searchLabel,
  searchPlaceholder,
  inputName,
  options,
  formAction,
  formError,
  emptyMessage = "검색 결과가 없습니다.",
  submitLabel,
}: AssignmentSearchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearch(query);
  const filteredOptions = useMemo(
    () => options.filter((option) => normalizeSearch(`${option.label} ${option.detail ?? ""}`).includes(normalizedQuery)),
    [normalizedQuery, options],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={title}
        onClick={() => setOpen((current) => !current)}
        className="flex size-10 items-center justify-center rounded-xl border border-[var(--accent)] text-2xl font-medium leading-none text-[var(--accent-strong)] transition hover:bg-[#e5f2f0] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#bce9e4]"
      >
        <span aria-hidden="true">+</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_18px_55px_rgba(23,64,60,0.16)]">
          <label htmlFor={`${inputName}-search`} className="mb-2 block text-sm font-bold">{searchLabel}</label>
          <input
            ref={inputRef}
            id={`${inputName}-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4]"
          />
          {formError ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900">{formError}</p> : null}
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-4 text-sm text-[var(--muted)]">{emptyMessage}</p>
            ) : filteredOptions.map((option) => (
              <form key={option.value} action={formAction} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
                <input type="hidden" name={inputName} value={option.value} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{option.label}</p>
                  {option.detail ? <p className="mt-1 text-sm text-[var(--muted)]">{option.detail}</p> : null}
                </div>
                {option.disabled ? (
                  <span className="shrink-0 text-sm font-bold text-[var(--muted)]">{option.disabledLabel ?? "배정됨"}</span>
                ) : <AssignButton label={submitLabel} />}
              </form>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
