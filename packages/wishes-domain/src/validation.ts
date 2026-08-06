import { InvalidWishError } from "./errors";
import type { WishLocale, WishVisibility } from "./types";

export const MIN_WISH_LENGTH = 3;
export const MAX_WISH_LENGTH = 300;

export interface SubmitWishInput {
  readonly message: string;
  readonly visibility: WishVisibility;
  readonly locale: WishLocale;
  readonly turnstileToken?: string | null;
  readonly remoteIp?: string | null;
}

export function normalizeWishInput(input: SubmitWishInput) {
  const message = input.message.trim().replace(/\s{3,}/g, "  ");
  if (
    message.length < MIN_WISH_LENGTH ||
    message.length > MAX_WISH_LENGTH
  ) {
    throw new InvalidWishError(
      `소원은 ${MIN_WISH_LENGTH}자 이상 ${MAX_WISH_LENGTH}자 이하로 작성해 주세요.`,
    );
  }
  if (!(["public", "private"] as const).includes(input.visibility)) {
    throw new InvalidWishError("공개 설정이 올바르지 않습니다.");
  }
  if (!(["ko", "en"] as const).includes(input.locale)) {
    throw new InvalidWishError("언어 설정이 올바르지 않습니다.");
  }

  return { message };
}
