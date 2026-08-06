import type { NewWish, PublicWish, Wish } from "./types";

export interface WishSubmissionPolicy {
  readonly maxSubmissions: number;
  readonly windowSeconds: number;
}

export interface WishRepository {
  listApproved(limit: number): Promise<readonly PublicWish[]>;
  /**
   * Atomically enforces the submission policy and persists the wish.
   * Returns null when the database rejects the submission as rate limited.
   */
  createWithinRateLimit(
    input: NewWish,
    policy: WishSubmissionPolicy,
  ): Promise<Wish | null>;
}

export interface HumanVerifier {
  verify(token: string | null, remoteIp: string | null): Promise<boolean>;
}

export interface IdHasher {
  hash(value: string): Promise<string>;
}
