const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "입력한 정보가 올바르지 않습니다.",
  email_not_confirmed: "로그인할 수 없는 계정입니다. 운영자에게 문의해 주세요.",
  over_request_rate_limit: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  over_email_send_rate_limit: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  user_banned: "사용할 수 없는 계정입니다. 운영자에게 문의해 주세요.",
};

export function getLoginErrorMessage(code?: string) {
  if (code && LOGIN_ERROR_MESSAGES[code]) {
    return LOGIN_ERROR_MESSAGES[code];
  }

  return "로그인에 실패했습니다. 입력한 정보를 확인해 주세요.";
}
