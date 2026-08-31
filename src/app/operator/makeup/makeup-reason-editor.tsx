"use client";

import { useState } from "react";
import { updateMakeupReason } from "./actions";

export function MakeupReasonEditor({ makeupId, reason }: { makeupId: string; reason: string | null }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="mt-3">
        <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{reason || "사유 없음"}</p>
        <button type="button" onClick={() => setEditing(true)} className="mt-2 text-sm font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline">
          수정
        </button>
      </div>
    );
  }

  return (
    <form action={updateMakeupReason.bind(null, makeupId)} className="mt-3 space-y-2">
      <textarea name="reason" defaultValue={reason ?? ""} rows={3} autoFocus placeholder="보강 사유" className="w-full rounded-xl border border-[#9badaa] px-3 py-2" />
      <div className="flex gap-2">
        <button className="h-9 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white">저장</button>
        <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg border px-3 text-sm font-bold">취소</button>
      </div>
    </form>
  );
}
