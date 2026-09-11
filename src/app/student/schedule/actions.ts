"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GOAL_MAX_LENGTH = 1000;

export type StudentGoalActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  goal?: string | null;
};

export async function updateMyStudentGoal(
  _previousState: StudentGoalActionState,
  formData: FormData,
): Promise<StudentGoalActionState> {
  await requireAuthenticatedUser("/login/student", "student");
  const goal = String(formData.get("goal") ?? "")
    .replace(/\r\n/g, "\n")
    .trim() || null;

  if (goal && goal.length > GOAL_MAX_LENGTH) {
    return {
      status: "error",
      message: `목표는 ${GOAL_MAX_LENGTH}자 이하로 입력해 주세요.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_my_student_goal", {
    new_goal: goal,
  });
  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;

  if (error || result?.goalUpdated !== true) {
    if (error) console.error({ code: error.code });
    return {
      status: "error",
      message: error?.code === "23514"
        ? `목표는 ${GOAL_MAX_LENGTH}자 이하로 입력해 주세요.`
        : "목표를 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  revalidatePath("/student/schedule");
  revalidatePath("/operator/students/[id]", "page");
  return {
    status: "success",
    message: "목표를 수정했습니다.",
    goal: typeof result.goal === "string" ? result.goal : null,
  };
}
