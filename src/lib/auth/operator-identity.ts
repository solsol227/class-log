const STAFF_AUTH_DOMAIN = "staff.classlog.demo";
const STAFF_LOGIN_ID_PATTERN = /^[a-z0-9_-]{4,32}$/;

export class InvalidStaffLoginIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStaffLoginIdError";
  }
}

export function normalizeStaffLoginId(value: string) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();

  if (!normalized) {
    throw new InvalidStaffLoginIdError("로그인 아이디를 입력해 주세요.");
  }

  if (!STAFF_LOGIN_ID_PATTERN.test(normalized)) {
    throw new InvalidStaffLoginIdError(
      "로그인 아이디는 영문 소문자, 숫자, _, -만 사용해 4~32자로 입력해 주세요.",
    );
  }

  return normalized;
}

export function staffLoginIdToAuthEmail(value: string) {
  return `${normalizeStaffLoginId(value)}@${STAFF_AUTH_DOMAIN}`;
}
