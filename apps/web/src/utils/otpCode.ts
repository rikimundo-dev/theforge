/** Strip separators and keep up to six digits (OTP length for The Forge login). */
export function normalizeOtpCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

export const OTP_CODE_LENGTH = 6;

export function isCompleteOtpCode(code: string): boolean {
  return normalizeOtpCode(code).length === OTP_CODE_LENGTH;
}
