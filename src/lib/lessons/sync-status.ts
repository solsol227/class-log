import type { SupabaseClient } from "@supabase/supabase-js";

export async function syncElapsedLessonStatuses(
  supabase: SupabaseClient,
  lessonIds: string[],
) {
  const uniqueLessonIds = [...new Set(lessonIds)];
  if (uniqueLessonIds.length === 0) return true;

  const { error } = await supabase.rpc("sync_elapsed_lesson_statuses", {
    target_lesson_ids: uniqueLessonIds,
  });
  if (error) {
    console.error("시간이 지난 일정 상태를 동기화하지 못했습니다.", error);
    return false;
  }
  return true;
}
