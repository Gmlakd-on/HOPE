import { InvalidWishError, WishRateLimitError } from "./errors";
import type {
  HumanVerifier,
  IdHasher,
  WishRepository,
  WishSubmissionPolicy,
} from "./ports";
import type { PublicWish, Wish } from "./types";
import { normalizeWishInput, type SubmitWishInput } from "./validation";

const DEFAULT_LIST_LIMIT = 24;
const MIN_LIST_LIMIT = 1;
const MAX_LIST_LIMIT = 50;

export class ListApprovedWishes {
  constructor(private readonly repository: WishRepository) {}

  async execute(limit = DEFAULT_LIST_LIMIT): Promise<readonly PublicWish[]> {
    if (!Number.isFinite(limit))
      throw new InvalidWishError("목록 개수가 올바르지 않습니다.");
    const safeLimit = Math.max(
      MIN_LIST_LIMIT,
      Math.min(MAX_LIST_LIMIT, Math.trunc(limit)),
    );
    return this.repository.listApproved(safeLimit);
  }
}

export class SubmitWish {
  constructor(
    private readonly repository: WishRepository,
    private readonly verifier: HumanVerifier,
    private readonly hasher: IdHasher,
    private readonly policy: WishSubmissionPolicy,
  ) {
    if (!Number.isInteger(policy.maxSubmissions) || policy.maxSubmissions < 1) {
      throw new Error("maxSubmissions must be a positive integer.");
    }
    if (!Number.isInteger(policy.windowSeconds) || policy.windowSeconds < 1) {
      throw new Error("windowSeconds must be a positive integer.");
    }
  }

  async execute(input: SubmitWishInput): Promise<Wish> {
    const normalized = normalizeWishInput(input);

    const verified = await this.verifier.verify(
      input.turnstileToken ?? null,
      input.remoteIp ?? null,
    );
    if (!verified)
      throw new InvalidWishError(
        "봇 방지 확인에 실패했습니다. 다시 시도해 주세요.",
      );

    const remoteIp = input.remoteIp?.trim();
    if (!remoteIp) {
      throw new InvalidWishError(
        "요청 식별 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    const submitterHash = await this.hasher.hash(remoteIp);
    const wish = await this.repository.createWithinRateLimit(
      {
        ...normalized,
        visibility: input.visibility,
        locale: input.locale,
        submitterHash,
      },
      this.policy,
    );

    if (!wish) throw new WishRateLimitError();
    return wish;
  }
}
