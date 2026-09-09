"use client";

import { useEffect, useState } from "react";

export function PressHoldPasswordField({ id, name, label, error }: { id: string; name: string; label: string; error?: string }) {
  const [revealed, setRevealed] = useState(false);
  const errorId = `${id}-error`;

  useEffect(() => {
    const hide = () => setRevealed(false);
    const onVisibility = () => { if (document.hidden) hide(); };
    window.addEventListener("blur", hide);
    window.addEventListener("pointerup", hide);
    window.addEventListener("pointercancel", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("pointerup", hide);
      window.removeEventListener("pointercancel", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label>
    <div className="relative">
      <input id={id} name={name} type={revealed ? "text" : "password"} autoComplete="new-password" required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="h-12 w-full rounded-xl border border-[#9badaa] bg-white px-4 pr-14 outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[#bce9e4] aria-invalid:border-rose-600" />
      <button type="button" aria-label="누르고 있는 동안 비밀번호 보기" aria-pressed={revealed} aria-controls={id}
        onPointerDown={(event) => { if (event.isPrimary && event.button === 0) setRevealed(true); }}
        onPointerUp={() => setRevealed(false)} onPointerLeave={() => setRevealed(false)} onPointerCancel={() => setRevealed(false)} onLostPointerCapture={() => setRevealed(false)}
        onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setRevealed(true); } }}
        onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setRevealed(false); } }}
        onBlur={() => setRevealed(false)} onContextMenu={(event) => { event.preventDefault(); setRevealed(false); }}
        className="absolute inset-y-1 right-1 flex w-10 touch-manipulation items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[#e5f2f0] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
      </button>
    </div>
    {error ? <p id={errorId} className="mt-2 text-sm font-semibold text-rose-800">{error}</p> : null}
  </div>;
}
