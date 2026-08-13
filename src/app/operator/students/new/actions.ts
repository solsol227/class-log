"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-auth";
import {
  InvalidStudentNicknameError,
  normalizeStudentNickname,
  studentNicknameToAuthEmail,
} from "@/lib/auth/student-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StudentCreateFieldErrors = {
  nickname?: string;
  password?: string;
  passwordConfirmation?: string;
};

export type StudentCreateActionState = {
  fieldErrors: StudentCreateFieldErrors;
  formError?: string;
  values?: {
    nickname: string;
  };
};

const GENERIC_ERROR = "학생을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const DUPLICATE_NICKNAME_ERROR = "이미 사용 중인 이름입니다.";

function isDuplicateAuthUserError(error: { code?: string }) {
  return error.code === "email_exists" || error.code === "user_already_exists";
}

export async function createStudent(
  _previousState: StudentCreateActionState,
  formData: FormData,
): Promise<StudentCreateActionState> {
  await requireAuthenticatedUser("/login/operator", "operator");

  const rawNickname = String(formData.get("nickname") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(
    formData.get("password_confirmation") ?? "",
  );
  const fieldErrors: StudentCreateFieldErrors = {};
  let nickname = "";
  let email = "";

  try {
    nickname = normalizeStudentNickname(rawNickname);
    email = studentNicknameToAuthEmail(nickname);
  } catch (error) {
    fieldErrors.nickname =
      error instanceof InvalidStudentNicknameError
        ? error.message
        : "이름을 확인해 주세요.";
  }

  if (!password) {
    fieldErrors.password = "비밀번호를 입력해 주세요.";
  } else if (password.length < 8) {
    fieldErrors.password = "비밀번호는 8자 이상 입력해 주세요.";
  }

  if (!passwordConfirmation) {
    fieldErrors.passwordConfirmation = "비밀번호 확인을 입력해 주세요.";
  } else if (password !== passwordConfirmation) {
    fieldErrors.passwordConfirmation = "비밀번호가 일치하지 않습니다.";
  }

  const values = {
    nickname: rawNickname,
  };

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existingStudent, error: lookupError } = await supabase
    .from("students")
    .select("id")
    .eq("nickname", nickname)
    .maybeSingle();

  if (lookupError) {
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  if (existingStudent) {
    return {
      fieldErrors: { nickname: DUPLICATE_NICKNAME_ERROR },
      values,
    };
  }

  let adminClient;

  try {
    adminClient = createSupabaseAdminClient();
  } catch {
    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "student" },
    });

  if (authError) {
    if (isDuplicateAuthUserError(authError)) {
      return {
        fieldErrors: { nickname: DUPLICATE_NICKNAME_ERROR },
        values,
      };
    }

    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  const { data: student, error: insertError } = await supabase
    .from("students")
    .insert({
      auth_user_id: authData.user.id,
      nickname,
      display_name: nickname,
    })
    .select("id")
    .single();

  if (insertError) {
    try {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(
        authData.user.id,
      );

      if (cleanupError) {
        console.error("생성된 학생 인증 계정 정리에 실패했습니다.", cleanupError);
      }
    } catch (cleanupError) {
      console.error("생성된 학생 인증 계정 정리에 실패했습니다.", cleanupError);
    }

    if (insertError.code === "23505") {
      return {
        fieldErrors: { nickname: DUPLICATE_NICKNAME_ERROR },
        values,
      };
    }

    return { fieldErrors: {}, formError: GENERIC_ERROR, values };
  }

  redirect(`/operator/students/${student.id}?created=1`);
}
