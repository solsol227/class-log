"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CheckState =
  | { status: "idle"; message: string }
  | { status: "checking"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type ConnectionResult = {
  ok: boolean;
  message: string;
};

export function ConnectionCheck() {
  const [state, setState] = useState<CheckState>({
    status: "idle",
    message: "버튼을 눌러 Supabase Auth 연결 상태를 확인하세요.",
  });

  async function checkConnection() {
    setState({ status: "checking", message: "연결을 확인하고 있습니다." });

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error("session-check-failed");
      }

      const response = await fetch("/api/dev/supabase-connection", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("connection-endpoint-unavailable");
      }

      const result = (await response.json()) as ConnectionResult;
      setState({
        status: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch {
      setState({
        status: "error",
        message: "연결 확인에 실패했습니다. 환경변수와 네트워크를 확인해 주세요.",
      });
    }
  }

  const statusStyles = {
    idle: "border-slate-200 bg-slate-50 text-slate-700",
    checking: "border-sky-200 bg-sky-50 text-sky-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
  }[state.status];

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={checkConnection}
        disabled={state.status === "checking"}
        className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-5 font-bold text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px disabled:cursor-wait disabled:opacity-70"
      >
        {state.status === "checking" ? "확인 중" : "Supabase 연결 확인"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold leading-6 ${statusStyles}`}
      >
        {state.message}
      </p>
    </div>
  );
}
