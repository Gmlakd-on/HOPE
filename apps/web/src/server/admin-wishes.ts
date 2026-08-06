import {
  readSupabaseError,
  resolveSupabaseRestConfig,
  supabaseHeaders,
  supabaseRestUrl,
  type SupabaseEnvironment,
} from "./supabase-rest";

export interface AdminWish {
  readonly id: string;
  readonly message: string;
  readonly visibility: "public" | "private";
  readonly status: "pending" | "approved" | "rejected";
  readonly locale: "ko" | "en";
  readonly moderationNote: string | null;
  readonly createdAt: string;
  readonly approvedAt: string | null;
}

interface WishRow {
  id: string;
  message: string;
  visibility: "public" | "private";
  status: "pending" | "approved" | "rejected";
  locale: "ko" | "en";
  moderation_note: string | null;
  created_at: string;
  approved_at: string | null;
}

export type AdminWishEnvironment = SupabaseEnvironment;

function toAdminWish(row: WishRow): AdminWish {
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

export async function listPublicWishes(
  environment: AdminWishEnvironment,
  limit = 100,
): Promise<readonly AdminWish[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const config = resolveSupabaseRestConfig(environment);
  const url = supabaseRestUrl(config, "wishes");
  url.searchParams.set(
    "select",
    "id,message,visibility,status,locale,moderation_note,created_at,approved_at",
  );
  url.searchParams.set("visibility", "eq.public");
  url.searchParams.set("status", "eq.approved");
  url.searchParams.set("order", "created_at.desc");
  url.searchParams.set("limit", String(safeLimit));

  const response = await fetch(url, {
    headers: supabaseHeaders(config),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Failed to list public wishes: ${await readSupabaseError(response)}`,
    );
  }
  return ((await response.json()) as WishRow[]).map(toAdminWish);
}

export async function hidePublicWish(
  environment: AdminWishEnvironment,
  input: {
    readonly id: string;
    readonly moderationNote: string | null;
  },
): Promise<void> {
  const config = resolveSupabaseRestConfig(environment);
  const url = supabaseRestUrl(config, "wishes");
  url.searchParams.set("id", `eq.${input.id}`);
  url.searchParams.set("visibility", "eq.public");

  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(config, {
      "content-type": "application/json",
      prefer: "return=representation",
    }),
    body: JSON.stringify({
      visibility: "private",
      moderation_note:
        input.moderationNote || "관리자 페이지에서 비공개로 전환됨",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Failed to hide public wish: ${await readSupabaseError(response)}`,
    );
  }
  const rows = (await response.json()) as unknown[];
  if (rows.length !== 1) throw new Error("Public wish was not found.");
}
