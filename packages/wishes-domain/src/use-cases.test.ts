import { describe, expect, it } from "vitest";
import type {
  HumanVerifier,
  IdHasher,
  NewWish,
  PublicWish,
  Wish,
  WishRepository,
  WishSubmissionPolicy,
} from "./index";
import { ListApprovedWishes, SubmitWish, WishRateLimitError } from "./index";

class InMemoryWishRepository implements WishRepository {
  readonly wishes: Wish[] = [];
  private readonly queues = new Map<string, Promise<void>>();

  async listApproved(limit: number): Promise<readonly PublicWish[]> {
    return this.wishes
      .filter(
        (wish) => wish.status === "approved" && wish.visibility === "public",
      )
      .slice(0, limit)
      .map(({ id, message, locale }) => ({ id, message, locale }));
  }

  async createWithinRateLimit(
    input: NewWish,
    policy: WishSubmissionPolicy,
  ): Promise<Wish | null> {
    const key = input.submitterHash ?? crypto.randomUUID();
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.queues.set(key, queued);

    await previous;
    try {
      // Yield once so the parallel test would expose a non-atomic implementation.
      await Promise.resolve();
      const recentCount = this.wishes.filter((wish) =>
        wish.id.startsWith(`${key}:`),
      ).length;
      if (recentCount >= policy.maxSubmissions) return null;

      const wish: Wish = {
        id: `${key}:${recentCount + 1}`,
        message: input.message,
        visibility: input.visibility,
        locale: input.locale,
        status: "pending",
        createdAt: "2026-07-17T00:00:00.000Z",
        approvedAt: null,
      };
      this.wishes.push(wish);
      return wish;
    } finally {
      release();
      if (this.queues.get(key) === queued) this.queues.delete(key);
    }
  }
}

const verifier: HumanVerifier = { verify: async () => true };
const hasher: IdHasher = { hash: async (value) => `hash:${value}` };
const policy = { maxSubmissions: 2, windowSeconds: 60 } as const;

describe("SubmitWish", () => {
  it("stores a normalized pending wish", async () => {
    const repository = new InMemoryWishRepository();
    const useCase = new SubmitWish(repository, verifier, hasher, policy);

    const result = await useCase.execute({
      message: "  건강하게 지내고 싶어요.  ",
      visibility: "public",
      locale: "ko",
      remoteIp: "127.0.0.1",
    });

    expect(result.message).toBe("건강하게 지내고 싶어요.");
    expect(result.status).toBe("pending");
  });

  it("fails closed when the submitter identity is unavailable", async () => {
    const repository = new InMemoryWishRepository();
    const useCase = new SubmitWish(repository, verifier, hasher, policy);

    await expect(
      useCase.execute({
        message: "식별 정보가 없는 요청",
        visibility: "private",
        locale: "ko",
        remoteIp: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_WISH", status: 400 });
    expect(repository.wishes).toHaveLength(0);
  });

  it("never stores more than the limit under parallel submissions", async () => {
    const repository = new InMemoryWishRepository();
    const useCase = new SubmitWish(repository, verifier, hasher, policy);

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        useCase.execute({
          message: `병렬 소원 ${index}`,
          visibility: "private",
          locale: "ko",
          remoteIp: "203.0.113.10",
        }),
      ),
    );

    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(2);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(18);
    for (const result of attempts) {
      if (result.status === "rejected")
        expect(result.reason).toBeInstanceOf(WishRateLimitError);
    }
    expect(repository.wishes).toHaveLength(2);
  });
});

describe("ListApprovedWishes", () => {
  it("returns only approved public wishes", async () => {
    const repository = new InMemoryWishRepository();
    repository.wishes.push(
      {
        id: "approved",
        message: "공개 소원",
        visibility: "public",
        status: "approved",
        locale: "ko",
        createdAt: "2026-07-17T00:00:00.000Z",
        approvedAt: "2026-07-17T00:01:00.000Z",
      },
      {
        id: "private",
        message: "비공개 소원",
        visibility: "private",
        status: "approved",
        locale: "ko",
        createdAt: "2026-07-17T00:00:00.000Z",
        approvedAt: "2026-07-17T00:01:00.000Z",
      },
    );

    const results = await new ListApprovedWishes(repository).execute();
    expect(results).toEqual([
      { id: "approved", message: "공개 소원", locale: "ko" },
    ]);
  });
});
