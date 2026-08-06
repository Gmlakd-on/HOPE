import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  NewWish,
  PublicWish,
  Wish,
  WishRepository,
  WishSubmissionPolicy,
} from "@hope/wishes-domain";

interface WishRow {
  id: string;
  message: string;
  visibility: "public" | "private";
  status: "pending" | "approved" | "rejected";
  locale: "ko" | "en";
  created_at: string;
  approved_at: string | null;
}

export interface ModerationWish {
  readonly id: string;
  readonly message: string;
  readonly visibility: "public" | "private";
  readonly status: "pending" | "approved" | "rejected";
  readonly locale: "ko" | "en";
  readonly moderationNote: string | null;
  readonly createdAt: string;
  readonly approvedAt: string | null;
}

interface ModerationWishRow extends WishRow {
  moderation_note: string | null;
}

function toModerationWish(row: ModerationWishRow): ModerationWish {
  return {
    id: row.id,
    message: row.message,
    visibility: row.visibility,
    status: row.status,
    locale: row.locale,
    moderationNote: row.moderation_note,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

type AtomicSubmissionResult =
  | { readonly accepted: false }
  | { readonly accepted: true; readonly wish: WishRow };

function toWish(row: WishRow): Wish {
  return {
    id: row.id,
    message: row.message,
    visibility: row.visibility,
    status: row.status,
    locale: row.locale,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

function isAtomicSubmissionResult(
  value: unknown,
): value is AtomicSubmissionResult {
  if (!value || typeof value !== "object" || !("accepted" in value))
    return false;

  const accepted = (value as { accepted?: unknown }).accepted;

  if (accepted === false) return true;
  if (accepted !== true || !("wish" in value)) return false;

  const wish = (value as { wish?: unknown }).wish;

  return Boolean(
    wish && typeof wish === "object" && "id" in wish && "message" in wish,
  );
}

export class SupabaseWishRepository implements WishRepository {
  constructor(private readonly client: SupabaseClient) {}

  static fromEnvironment(
    url: string,
    secretKey: string,
  ): SupabaseWishRepository {
    return new SupabaseWishRepository(
      createClient(url, secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }),
    );
  }

  async listApproved(limit: number): Promise<readonly PublicWish[]> {
    const { data, error } = await this.client
      .from("wishes")
      .select("id,message,locale")
      .eq("status", "approved")
      .eq("visibility", "public")
      .order("approved_at", { ascending: false })
      .limit(limit);

    if (error)
      throw new Error(`Failed to list approved wishes: ${error.message}`);

    return (data ?? []) as PublicWish[];
  }

  async listApprovedFeed(
    limit: number,
  ): Promise<{
    readonly items: readonly PublicWish[];
    readonly total: number;
  }> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));

    const { data, count, error } = await this.client
      .from("wishes")
      .select("id,message,locale", { count: "exact" })
      .eq("status", "approved")
      .eq("visibility", "public")
      .order("approved_at", { ascending: false })
      .limit(safeLimit);

    if (error)
      throw new Error(`Failed to load approved wish feed: ${error.message}`);

    return {
      items: (data ?? []) as PublicWish[],
      total: count ?? 0,
    };
  }

  async countAll(): Promise<number> {
    const { count, error } = await this.client
      .from("wishes")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("visibility", "public");

    if (error)
      throw new Error(`Failed to count approved public wishes: ${error.message}`);

    return count ?? 0;
  }

  async listPendingPublicForModeration(): Promise<readonly ModerationWish[]> {
    const { data, error } = await this.client
      .from("wishes")
      .select(
        "id,message,visibility,status,locale,moderation_note,created_at,approved_at",
      )
      .eq("visibility", "public")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error)
      throw new Error(`Failed to list pending wishes: ${error.message}`);

    return ((data ?? []) as ModerationWishRow[]).map(toModerationWish);
  }

  async listRecentlyApprovedForModeration(
    limit = 20,
  ): Promise<readonly ModerationWish[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));

    const { data, error } = await this.client
      .from("wishes")
      .select(
        "id,message,visibility,status,locale,moderation_note,created_at,approved_at",
      )
      .eq("visibility", "public")
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(safeLimit);

    if (error)
      throw new Error(`Failed to list approved wishes: ${error.message}`);

    return ((data ?? []) as ModerationWishRow[]).map(toModerationWish);
  }

  async moderateWish(
    id: string,
    status: "approved" | "rejected",
    moderationNote: string | null,
  ): Promise<void> {
    const { data, error } = await this.client
      .from("wishes")
      .update({
        status,
        moderation_note: moderationNote,
      })
      .eq("id", id)
      .eq("visibility", "public")
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error)
      throw new Error(`Failed to moderate wish: ${error.message}`);

    if (!data)
      throw new Error("Pending public wish was not found.");
  }

  async createWithinRateLimit(
    input: NewWish,
    policy: WishSubmissionPolicy,
  ): Promise<Wish | null> {
    const { data, error } = await this.client.rpc("submit_wish_atomic", {
      p_message: input.message,
      p_visibility: input.visibility,
      p_locale: input.locale,
      p_submitter_hash: input.submitterHash,
      p_max_submissions: policy.maxSubmissions,
      p_window_seconds: policy.windowSeconds,
    });

    if (error)
      throw new Error(`Failed to submit wish atomically: ${error.message}`);

    if (!isAtomicSubmissionResult(data))
      throw new Error("Atomic wish submission returned an invalid payload.");

    if (!data.accepted)
      return null;

    const wish = toWish(data.wish);

    if (wish.visibility !== "public" || wish.status === "approved")
      return wish;

    // Older deployments can still have the previous RPC, which stores every
    // submission as pending. Enforce the public auto-publish rule at the
    // repository boundary as well, so a code deployment works even before the
    // latest database migration is applied.
    const { data: approvedRow, error: approvalError } = await this.client
      .from("wishes")
      .update({
        status: "approved",
        moderation_note: null,
      })
      .eq("id", wish.id)
      .eq("visibility", "public")
      .select(
        "id,message,visibility,status,locale,created_at,approved_at",
      )
      .single();

    if (approvalError) {
      throw new Error(
        `Failed to auto-publish public wish: ${approvalError.message}`,
      );
    }

    return toWish(approvedRow as WishRow);
  }
}