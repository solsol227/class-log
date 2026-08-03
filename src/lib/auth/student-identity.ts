const STUDENT_AUTH_DOMAIN = "classlog.demo";
const MAX_NICKNAME_UTF8_BYTES = 36;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export class InvalidStudentNicknameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStudentNicknameError";
  }
}

export function normalizeStudentNickname(nickname: string) {
  const normalized = nickname.normalize("NFKC").trim().toLowerCase();

  if (!normalized) {
    throw new InvalidStudentNicknameError("닉네임을 입력해 주세요.");
  }

  const bytes = new TextEncoder().encode(normalized);

  if (bytes.length > MAX_NICKNAME_UTF8_BYTES) {
    throw new InvalidStudentNicknameError("닉네임이 너무 깁니다.");
  }

  return normalized;
}

function encodeBase32(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let result = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}

export function studentNicknameToAuthEmail(nickname: string) {
  const normalizedNickname = normalizeStudentNickname(nickname);
  const encodedNickname = encodeBase32(
    new TextEncoder().encode(normalizedNickname),
  );

  return `${encodedNickname}@${STUDENT_AUTH_DOMAIN}`;
}
