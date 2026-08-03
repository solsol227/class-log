export const AUTH_ERROR_CODES = [
  "auth_invalid_credentials",
  "network_error",
  "auth_server_error",
  "session_expired",
  "invalid_role",
  "forbidden_route",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthUserMessage = {
  message: string;
  action: string;
};

const AUTH_USER_MESSAGES: Record<AuthErrorCode, AuthUserMessage> = {
  auth_invalid_credentials: {
    message: "입력한 계정 정보가 올바르지 않습니다.",
    action: "입력 내용을 확인한 뒤 다시 로그인해 주세요.",
  },
  network_error: {
    message: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
    action: "연결 상태를 확인하고 로그인 버튼을 다시 눌러 주세요.",
  },
  auth_server_error: {
    message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    action: "잠시 기다린 뒤 로그인 버튼을 다시 눌러 주세요.",
  },
  session_expired: {
    message: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
    action: "계정 정보를 다시 입력해 주세요.",
  },
  invalid_role: {
    message: "계정의 이용 권한을 확인할 수 없습니다. 운영자에게 문의해 주세요.",
    action: "수업 운영자에게 계정 권한 설정을 확인해 달라고 요청해 주세요.",
  },
  forbidden_route: {
    message: "이 계정으로는 해당 화면에 접근할 수 없습니다.",
    action: "현재 계정에 맞는 화면으로 이동했습니다.",
  },
};

const INVALID_CREDENTIAL_CODES = new Set([
  "invalid_credentials",
  "email_not_confirmed",
  "email_address_invalid",
  "user_banned",
  "user_not_found",
  "validation_failed",
]);

const NETWORK_ERROR_CODES = new Set([
  "fetch_error",
  "network_error",
  "request_timeout",
]);

const AUTH_NOTICE_TO_ERROR = {
  "session-expired": "session_expired",
  "invalid-role": "invalid_role",
  "forbidden-route": "forbidden_route",
} as const satisfies Record<string, AuthErrorCode>;

export type AuthNotice = keyof typeof AUTH_NOTICE_TO_ERROR;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getAuthUserMessage(code: AuthErrorCode): AuthUserMessage {
  return AUTH_USER_MESSAGES[code];
}

export function getAuthNoticeMessage(value: unknown): AuthUserMessage | null {
  if (typeof value !== "string" || !(value in AUTH_NOTICE_TO_ERROR)) {
    return null;
  }

  const code = AUTH_NOTICE_TO_ERROR[value as AuthNotice];
  return getAuthUserMessage(code);
}

export function classifySupabaseLoginError(error: unknown): AuthErrorCode {
  if (!isRecord(error)) {
    return "auth_server_error";
  }

  const code = typeof error.code === "string" ? error.code : "";
  const status = typeof error.status === "number" ? error.status : null;
  const name = typeof error.name === "string" ? error.name : "";

  if (INVALID_CREDENTIAL_CODES.has(code)) {
    return "auth_invalid_credentials";
  }

  if (
    NETWORK_ERROR_CODES.has(code) ||
    status === 0 ||
    name === "AuthRetryableFetchError"
  ) {
    return "network_error";
  }

  return "auth_server_error";
}

export function classifyUnexpectedLoginError(error: unknown): AuthErrorCode {
  if (isRecord(error)) {
    const name = typeof error.name === "string" ? error.name : "";

    if (name === "TypeError" || name === "AuthRetryableFetchError") {
      return "network_error";
    }
  }

  return "auth_server_error";
}
