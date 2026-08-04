"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_PLAN_ERROR =
  "월간 활동 계획을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const DUPLICATE_MONTH_ERROR = "이미 해당 월의 계획이 있습니다.";

type PlanCreateFieldErrors = {
  month?: string;
  title?: string;
};

export type PlanCreateActionState = {
  fieldErrors: PlanCreateFieldErrors;
  formError?: string;
  values?: { month: string; title: string; summary: string };
};

export type ActivityItemsActionState = { formError?: string };
export type PublishPlanActionState = { formError?: string };

function monthInputToDate(value: string) {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }

  return `${value}-01`;
}

export async function createMonthlyPlan(
  studentId: string,
  _previousState: PlanCreateActionState,
  formData: FormData,
): Promise<PlanCreateActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");

  const rawMonth = String(formData.get("month") ?? "").trim();
  const rawTitle = String(formData.get("title") ?? "");
  const rawSummary = String(formData.get("summary") ?? "");
  const month = monthInputToDate(rawMonth);
  const title = rawTitle.trim();
  const summary = rawSummary.trim() || null;
  const fieldErrors: PlanCreateFieldErrors = {};
  const values = { month: rawMonth, title: rawTitle, summary: rawSummary };

  if (!UUID_PATTERN.test(studentId)) {
    return { fieldErrors: {}, formError: GENERIC_PLAN_ERROR, values };
  }

  if (!month) {
    fieldErrors.month = "올바른 연월을 선택해 주세요.";
  }

  if (!title) {
    fieldErrors.title = "계획 제목을 입력해 주세요.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return { fieldErrors: {}, formError: GENERIC_PLAN_ERROR, values };
  }

  const { data: existingPlan, error: duplicateCheckError } = await supabase
    .from("monthly_activity_plans")
    .select("id")
    .eq("student_id", studentId)
    .eq("month", month)
    .maybeSingle();

  if (duplicateCheckError) {
    console.error(duplicateCheckError);
    return { fieldErrors: {}, formError: GENERIC_PLAN_ERROR, values };
  }

  if (existingPlan) {
    return { fieldErrors: { month: DUPLICATE_MONTH_ERROR }, values };
  }

  const { data: plan, error: insertError } = await supabase
    .from("monthly_activity_plans")
    .insert({
      student_id: studentId,
      month,
      title,
      summary,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { fieldErrors: { month: DUPLICATE_MONTH_ERROR }, values };
    }

    return { fieldErrors: {}, formError: GENERIC_PLAN_ERROR, values };
  }

  redirect(`/operator/students/${studentId}/plans/${plan.id}?created=1`);
}

export async function addActivityItems(
  studentId: string,
  planId: string,
  _previousState: ActivityItemsActionState,
  formData: FormData,
): Promise<ActivityItemsActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(planId)) {
    return { formError: "활동 항목을 등록하지 못했습니다." };
  }

  const rawTitles = formData.getAll("item_title").map(String);
  const rawDescriptions = formData.getAll("item_description").map(String);
  const rowCount = Math.max(rawTitles.length, rawDescriptions.length);
  const items: Array<{ title: string; description: string | null }> = [];

  for (let index = 0; index < rowCount; index += 1) {
    const title = (rawTitles[index] ?? "").trim();
    const description = (rawDescriptions[index] ?? "").trim();

    if (!title && !description) {
      continue;
    }

    if (!title) {
      return { formError: "각 활동 항목의 제목을 입력해 주세요." };
    }

    items.push({ title, description: description || null });
  }

  if (items.length === 0) {
    return { formError: "활동 항목을 하나 이상 입력해 주세요." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("monthly_activity_plans")
    .select("id, student_id, status")
    .eq("id", planId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (planError || !plan) {
    if (planError) {
      console.error(planError);
    }
    return { formError: "활동 항목을 등록하지 못했습니다." };
  }

  if (plan.status !== "draft") {
    return { formError: "초안 상태의 계획에만 활동 항목을 추가할 수 있습니다." };
  }

  const { data: lastItem, error: positionError } = await supabase
    .from("monthly_activity_items")
    .select("position")
    .eq("plan_id", planId)
    .eq("student_id", studentId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (positionError) {
    console.error(positionError);
    return { formError: "활동 항목을 등록하지 못했습니다." };
  }

  const firstPosition = (lastItem?.position ?? -1) + 1;
  const rows = items.map((item, index) => ({
    plan_id: planId,
    student_id: studentId,
    title: item.title,
    description: item.description,
    position: firstPosition + index,
  }));

  const { error: insertError } = await supabase
    .from("monthly_activity_items")
    .insert(rows);

  if (insertError) {
    return { formError: "활동 항목을 등록하지 못했습니다." };
  }

  redirect(`/operator/students/${studentId}/plans/${planId}?itemsAdded=1`);
}

export async function publishMonthlyPlan(
  studentId: string,
  planId: string,
  _previousState: PublishPlanActionState,
  formData: FormData,
): Promise<PublishPlanActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");
  void formData;

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(planId)) {
    return { formError: "월간 활동 계획을 게시하지 못했습니다." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("monthly_activity_plans")
    .select("id, student_id, status")
    .eq("id", planId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (planError || !plan) {
    if (planError) {
      console.error(planError);
    }
    return { formError: "월간 활동 계획을 게시하지 못했습니다." };
  }

  if (plan.status !== "draft") {
    return { formError: "초안 상태의 계획만 게시할 수 있습니다." };
  }

  const { count, error: countError } = await supabase
    .from("monthly_activity_items")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)
    .eq("student_id", studentId);

  if (countError) {
    console.error(countError);
    return { formError: "월간 활동 계획을 게시하지 못했습니다." };
  }

  if (!count) {
    return { formError: "활동 항목을 하나 이상 등록한 후 게시해 주세요." };
  }

  const { data: updatedPlan, error: updateError } = await supabase
    .from("monthly_activity_plans")
    .update({ status: "published" })
    .eq("id", planId)
    .eq("student_id", studentId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPlan) {
    if (updateError) {
      console.error(updateError);
    }
    return { formError: "월간 활동 계획을 게시하지 못했습니다." };
  }

  redirect(`/operator/students/${studentId}/plans/${planId}?published=1`);
}
