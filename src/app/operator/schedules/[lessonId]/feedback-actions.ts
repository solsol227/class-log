"use server";

import { revalidatePath } from "next/cache";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import {
  loadOperatorStudentRecentFeedback,
  type OperatorFeedbackSummary,
} from "@/lib/feedback/operator-feedback";
import { STAFF_ROLE_LABELS } from "@/lib/feedback/student-feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FeedbackModalActionState = {
  status: "idle" | "success" | "error";
  message: string;
  feedback?: OperatorFeedbackSummary;
};

export type FeedbackHistoryActionState =
  | { status: "success"; items: OperatorFeedbackSummary[]; hasMore: boolean }
  | { status: "error"; message: string };

const isUuid = (value: string) => UUID_PATTERN.test(value);

async function validateContext(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, lessonId: string, studentId: string) {
  if (!isUuid(lessonId) || !isUuid(studentId)) return null;
  const [lessonResult, studentResult, assignmentResult] = await Promise.all([
    supabase.from("lessons").select("id, title, starts_at, ends_at, status").eq("id", lessonId).maybeSingle(),
    supabase.from("students").select("id").eq("id", studentId).maybeSingle(),
    supabase.from("lesson_assignments").select("lesson_id").eq("lesson_id", lessonId).eq("student_id", studentId).is("unassigned_at", null).maybeSingle(),
  ]);
  return !lessonResult.error && !studentResult.error && !assignmentResult.error
    && lessonResult.data && lessonResult.data.status !== "draft" && studentResult.data && assignmentResult.data
    ? lessonResult.data
    : null;
}

async function findAssignedActiveStaff(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, lessonId: string, staffId: string) {
  if (!isUuid(lessonId) || !isUuid(staffId)) return null;
  const [assignmentResult, staffResult] = await Promise.all([
    supabase.from("lesson_staff").select("staff_id").eq("lesson_id", lessonId).eq("staff_id", staffId).maybeSingle(),
    supabase.from("staff_profiles").select("id, display_name, role").eq("id", staffId).eq("is_active", true).maybeSingle(),
  ]);
  if (assignmentResult.error || staffResult.error || !assignmentResult.data || !staffResult.data) return null;
  return staffResult.data;
}

async function validateAssignedStaff(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, lessonId: string, access: Awaited<ReturnType<typeof requireOperatorAccess>>) {
  if (access.isOwner) return true;
  const result = await supabase.from("lesson_staff").select("lesson_id").eq("lesson_id", lessonId).eq("staff_id", access.staffProfileId!).maybeSingle();
  return !result.error && Boolean(result.data);
}

function revalidateFeedbackPaths(lessonId: string, studentId: string) {
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath(`/operator/students/${studentId}`);
  revalidatePath(`/operator/students/${studentId}/feedback`);
  revalidatePath(`/student/schedule/${lessonId}`);
  revalidatePath("/student/feedback");
}

export async function createModalFeedback(lessonId: string, studentId: string, _previousState: FeedbackModalActionState, formData: FormData): Promise<FeedbackModalActionState> {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { status: "error", message: "피드백 내용을 입력해 주세요." };
  if (body.length > 10000) return { status: "error", message: "피드백은 10,000자 이하로 입력해 주세요." };

  const authorStaffId = access.isOwner ? String(formData.get("author_staff_id") ?? "") : access.staffProfileId!;
  const supabase = await createSupabaseServerClient();
  const [context, assignedStaffAllowed, author] = await Promise.all([
    validateContext(supabase, lessonId, studentId),
    validateAssignedStaff(supabase, lessonId, access),
    findAssignedActiveStaff(supabase, lessonId, authorStaffId),
  ]);
  if (!context || !assignedStaffAllowed || !author) return { status: "error", message: "피드백을 저장할 수 없습니다. 학생과 담당 직원 배정을 확인해 주세요." };

  const result = await supabase.from("lesson_feedback").insert({ lesson_id: lessonId, student_id: studentId, author_staff_id: authorStaffId, body }).select("id, body, created_at").maybeSingle();
  if (result.error || !result.data) return { status: "error", message: "피드백을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  revalidateFeedbackPaths(lessonId, studentId);
  return {
    status: "success",
    message: "피드백을 저장했습니다.",
    feedback: {
      id: result.data.id,
      lessonId,
      studentId,
      studentName: "",
      lessonTitle: context.title,
      startsAt: context.starts_at,
      endsAt: context.ends_at,
      body: result.data.body,
      authorName: author.display_name,
      authorRole: STAFF_ROLE_LABELS[author.role] ?? author.role,
      createdAt: result.data.created_at,
      updatedAt: result.data.created_at,
      commentCount: 0,
      attachments: [],
    },
  };
}

export async function loadModalFeedbackHistory(lessonId: string, studentId: string): Promise<FeedbackHistoryActionState> {
  await requireOperatorAccess();
  if (!isUuid(lessonId) || !isUuid(studentId)) {
    return { status: "error", message: "최근 피드백을 불러올 수 없습니다." };
  }

  const supabase = await createSupabaseServerClient();
  const [lessonResult, studentResult, assignmentResult] = await Promise.all([
    supabase.from("lessons").select("id").eq("id", lessonId).maybeSingle(),
    supabase.from("students").select("id, nickname").eq("id", studentId).maybeSingle(),
    supabase.from("lesson_assignments").select("lesson_id").eq("lesson_id", lessonId).eq("student_id", studentId).is("unassigned_at", null).maybeSingle(),
  ]);
  if (lessonResult.error || studentResult.error || assignmentResult.error
    || !lessonResult.data || !studentResult.data || !assignmentResult.data) {
    return { status: "error", message: "학생의 최근 피드백을 불러올 수 없습니다." };
  }

  try {
    const recent = await loadOperatorStudentRecentFeedback(supabase, studentResult.data, 4);
    return { status: "success", items: recent.slice(0, 3), hasMore: recent.length > 3 };
  } catch (error) {
    console.error(error);
    return { status: "error", message: "최근 피드백을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
