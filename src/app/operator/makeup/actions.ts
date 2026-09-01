"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function revalidateMakeupPaths(replacementLessonId?: string) {
  revalidatePath("/operator/makeup");
  revalidatePath("/operator/schedules");
  revalidatePath("/student/schedule");
  if (replacementLessonId && UUID_PATTERN.test(replacementLessonId)) {
    revalidatePath(`/operator/schedules/${replacementLessonId}`);
  }
}

function schedulingErrorCode(code?: string) {
  if (code === "23P01") return "conflict";
  if (code === "23505") return "replacement_used";
  if (code === "23514") return "program";
  if (code === "P0001") return "assignment_history";
  if (code === "P0002") return "state";
  return "save";
}

export async function scheduleMakeup(makeupId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const replacementLessonId = String(formData.get("replacement_lesson_id") ?? "");
  if (!UUID_PATTERN.test(makeupId) || !UUID_PATTERN.test(replacementLessonId)) {
    redirect("/operator/makeup?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("schedule_makeup_lesson", {
    target_makeup_id: makeupId,
    target_replacement_lesson_id: replacementLessonId,
  });
  if (error || !data) {
    if (error) console.error(error);
    redirect(`/operator/makeup?error=${schedulingErrorCode(error?.code)}`);
  }

  revalidateMakeupPaths(replacementLessonId);
  redirect("/operator/makeup?scheduled=1");
}

export async function rescheduleMakeup(makeupId: string, previousReplacementLessonId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const replacementLessonId = String(formData.get("replacement_lesson_id") ?? "");
  if (
    !UUID_PATTERN.test(makeupId)
    || !UUID_PATTERN.test(previousReplacementLessonId)
    || !UUID_PATTERN.test(replacementLessonId)
  ) {
    redirect("/operator/makeup?error=invalid");
  }
  if (replacementLessonId === previousReplacementLessonId) {
    redirect("/operator/makeup?error=same_replacement");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reschedule_makeup_lesson", {
    target_makeup_id: makeupId,
    target_replacement_lesson_id: replacementLessonId,
  });
  if (error || !data) {
    if (error) console.error(error);
    redirect(`/operator/makeup?error=${schedulingErrorCode(error?.code)}`);
  }

  revalidateMakeupPaths(previousReplacementLessonId);
  revalidateMakeupPaths(replacementLessonId);
  redirect("/operator/makeup?rescheduled=1");
}

export async function updateMakeupReason(makeupId: string, formData: FormData) {
  await requireAuthenticatedUser("/login/operator", "operator");
  const reason = String(formData.get("reason") ?? "");
  if (!UUID_PATTERN.test(makeupId)) redirect("/operator/makeup?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_makeup_reason", {
    target_makeup_id: makeupId,
    new_reason: reason,
  });
  if (error || data !== makeupId) {
    if (error) console.error(error);
    redirect(`/operator/makeup?error=${error?.code === "P0002" ? "reason_state" : "reason"}`);
  }
  revalidateMakeupPaths();
  redirect("/operator/makeup?reasonUpdated=1");
}
