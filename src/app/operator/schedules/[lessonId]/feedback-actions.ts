"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperatorAccess } from "@/lib/auth/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function schedulePath(lessonId: string, error = false) {
  return `/operator/schedules/${lessonId}${error ? "?feedbackError=1" : "?feedbackUpdated=1"}`;
}

function studentFeedbackPath(lessonId: string, studentId: string, state: "error" | "saved") {
  const query = state === "error" ? "feedbackError=1" : `feedbackUpdated=1&saved=${Date.now()}`;
  return `/operator/schedules/${lessonId}/students/${studentId}/feedback?${query}`;
}

function isUuid(value: string) { return UUID_PATTERN.test(value); }

async function validateContext(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, lessonId: string, studentId: string) {
  if (!isUuid(lessonId) || !isUuid(studentId)) return false;
  const [lessonResult, studentResult, assignmentResult] = await Promise.all([
    supabase.from("lessons").select("id, status").eq("id", lessonId).maybeSingle(),
    supabase.from("students").select("id").eq("id", studentId).maybeSingle(),
    supabase.from("lesson_assignments").select("lesson_id").eq("lesson_id", lessonId).eq("student_id", studentId).is("unassigned_at", null).maybeSingle(),
  ]);
  return !lessonResult.error && !studentResult.error && !assignmentResult.error
    && Boolean(lessonResult.data && lessonResult.data.status !== "draft" && studentResult.data && assignmentResult.data);
}

async function validateActiveStaff(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, staffId: string) {
  if (!isUuid(staffId)) return false;
  const result = await supabase.from("staff_profiles").select("id").eq("id", staffId).eq("is_active", true).maybeSingle();
  return !result.error && Boolean(result.data);
}

async function validateAssignedStaff(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  lessonId: string,
  access: Awaited<ReturnType<typeof requireOperatorAccess>>,
) {
  if (access.isOwner) return true;
  const result = await supabase.from("lesson_staff").select("lesson_id").eq("lesson_id", lessonId).eq("staff_id", access.staffProfileId!).maybeSingle();
  return !result.error && Boolean(result.data);
}

async function findFeedback(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, lessonId: string, feedbackId: string, studentId?: string) {
  if (!isUuid(lessonId) || !isUuid(feedbackId) || (studentId && !isUuid(studentId))) return null;
  let query = supabase.from("lesson_feedback").select("id, student_id, author_staff_id").eq("id", feedbackId).eq("lesson_id", lessonId).is("deleted_at", null);
  if (studentId) query = query.eq("student_id", studentId);
  const result = await query.maybeSingle();
  return result.error ? null : result.data;
}

function revalidateFeedbackPaths(lessonId: string, studentId: string) {
  revalidatePath(`/operator/schedules/${lessonId}`);
  revalidatePath(`/operator/schedules/${lessonId}/students/${studentId}/feedback`);
  revalidatePath(`/operator/students/${studentId}`);
  revalidatePath(`/operator/students/${studentId}/feedback`);
  revalidatePath(`/student/schedule/${lessonId}`);
  revalidatePath("/student/feedback");
}

export async function createFeedback(lessonId: string, formData: FormData) {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "");
  const authorStaffId = access.isOwner ? String(formData.get("author_staff_id") ?? "") : access.staffProfileId!;
  const supabase = await createSupabaseServerClient();
  if (!body || body.length > 10000 || !await validateAssignedStaff(supabase, lessonId, access) || !await validateContext(supabase, lessonId, studentId) || !await validateActiveStaff(supabase, authorStaffId)) redirect(schedulePath(lessonId, true));
  const { data, error } = await supabase.from("lesson_feedback").insert({ lesson_id: lessonId, student_id: studentId, author_staff_id: authorStaffId, body, published_at: formData.get("published") === "on" ? new Date().toISOString() : null }).select("id").maybeSingle();
  if (error || !data) redirect(schedulePath(lessonId, true));
  revalidateFeedbackPaths(lessonId, studentId);
  redirect(schedulePath(lessonId));
}

export async function updateFeedback(lessonId: string, feedbackId: string, formData: FormData) {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, lessonId, feedbackId);
  if (!feedback || !body || body.length > 10000 || !await validateAssignedStaff(supabase, lessonId, access) || (!access.isOwner && feedback.author_staff_id !== access.staffProfileId) || !await validateContext(supabase, lessonId, feedback.student_id)) redirect(schedulePath(lessonId, true));
  const { data, error } = await supabase.from("lesson_feedback").update({ body, published_at: formData.get("published") === "on" ? new Date().toISOString() : null }).eq("id", feedbackId).eq("lesson_id", lessonId).eq("student_id", feedback.student_id).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) redirect(schedulePath(lessonId, true));
  revalidateFeedbackPaths(lessonId, feedback.student_id);
  redirect(schedulePath(lessonId));
}

export async function deleteFeedback(lessonId: string, feedbackId: string) {
  await requireOperatorAccess({ owner: true });
  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, lessonId, feedbackId);
  if (!feedback || !await validateContext(supabase, lessonId, feedback.student_id)) redirect(schedulePath(lessonId, true));
  const { data, error } = await supabase.from("lesson_feedback").update({ deleted_at: new Date().toISOString() }).eq("id", feedbackId).eq("lesson_id", lessonId).eq("student_id", feedback.student_id).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) redirect(schedulePath(lessonId, true));
  revalidateFeedbackPaths(lessonId, feedback.student_id);
  redirect(schedulePath(lessonId));
}

export async function addOperatorComment(lessonId: string, feedbackId: string, formData: FormData) {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  const parentCommentId = String(formData.get("parent_comment_id") ?? "") || null;
  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, lessonId, feedbackId);
  if (!feedback || !body || body.length > 2000 || (parentCommentId && !isUuid(parentCommentId)) || !await validateAssignedStaff(supabase, lessonId, access) || !await validateContext(supabase, lessonId, feedback.student_id)) redirect(schedulePath(lessonId, true));
  const { data, error } = await supabase.from("feedback_comments").insert({ feedback_id: feedbackId, parent_comment_id: parentCommentId, body }).select("id").maybeSingle();
  if (error || !data) redirect(schedulePath(lessonId, true));
  revalidateFeedbackPaths(lessonId, feedback.student_id);
  redirect(schedulePath(lessonId));
}

export async function createStudentFeedback(lessonId: string, studentId: string, formData: FormData) {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  const authorStaffId = access.isOwner ? String(formData.get("author_staff_id") ?? "") : access.staffProfileId!;
  const supabase = await createSupabaseServerClient();
  if (!body || body.length > 10000 || !await validateAssignedStaff(supabase, lessonId, access) || !await validateContext(supabase, lessonId, studentId) || !await validateActiveStaff(supabase, authorStaffId)) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  const { data, error } = await supabase.from("lesson_feedback").insert({ lesson_id: lessonId, student_id: studentId, author_staff_id: authorStaffId, body, published_at: formData.get("published") === "on" ? new Date().toISOString() : null }).select("id").maybeSingle();
  if (error || !data) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  revalidateFeedbackPaths(lessonId, studentId);
  redirect(studentFeedbackPath(lessonId, studentId, "saved"));
}

export async function updateStudentFeedback(lessonId: string, studentId: string, feedbackId: string, formData: FormData) {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  const authorStaffId = access.isOwner ? String(formData.get("author_staff_id") ?? "") : access.staffProfileId!;
  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, lessonId, feedbackId, studentId);
  const authorAllowed = feedback && (access.isOwner ? (authorStaffId === feedback.author_staff_id || await validateActiveStaff(supabase, authorStaffId)) : feedback.author_staff_id === access.staffProfileId);
  if (!feedback || !body || body.length > 10000 || !await validateAssignedStaff(supabase, lessonId, access) || !await validateContext(supabase, lessonId, studentId) || !authorAllowed) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  const { data, error } = await supabase.from("lesson_feedback").update({ author_staff_id: authorStaffId, body, published_at: formData.get("published") === "on" ? new Date().toISOString() : null }).eq("id", feedbackId).eq("lesson_id", lessonId).eq("student_id", studentId).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  revalidateFeedbackPaths(lessonId, studentId);
  redirect(studentFeedbackPath(lessonId, studentId, "saved"));
}

export async function deleteStudentFeedback(lessonId: string, studentId: string, feedbackId: string) {
  await requireOperatorAccess({ owner: true });
  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, lessonId, feedbackId, studentId);
  if (!feedback || !await validateContext(supabase, lessonId, studentId)) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  const { data, error } = await supabase.from("lesson_feedback").update({ deleted_at: new Date().toISOString() }).eq("id", feedbackId).eq("lesson_id", lessonId).eq("student_id", studentId).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  revalidateFeedbackPaths(lessonId, studentId);
  redirect(studentFeedbackPath(lessonId, studentId, "saved"));
}

export async function addStudentFeedbackComment(lessonId: string, studentId: string, feedbackId: string, formData: FormData) {
  const access = await requireOperatorAccess();
  const body = String(formData.get("body") ?? "").trim();
  const parentCommentId = String(formData.get("parent_comment_id") ?? "") || null;
  const supabase = await createSupabaseServerClient();
  const feedback = await findFeedback(supabase, lessonId, feedbackId, studentId);
  if (!feedback || !body || body.length > 2000 || (parentCommentId && !isUuid(parentCommentId)) || !await validateAssignedStaff(supabase, lessonId, access) || !await validateContext(supabase, lessonId, studentId)) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  const { data, error } = await supabase.from("feedback_comments").insert({ feedback_id: feedbackId, parent_comment_id: parentCommentId, body }).select("id").maybeSingle();
  if (error || !data) redirect(studentFeedbackPath(lessonId, studentId, "error"));
  revalidateFeedbackPaths(lessonId, studentId);
  redirect(studentFeedbackPath(lessonId, studentId, "saved"));
}
