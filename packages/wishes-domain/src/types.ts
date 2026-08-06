export type WishVisibility = "public" | "private";
export type WishStatus = "pending" | "approved" | "rejected";
export type WishLocale = "ko" | "en";

export interface Wish {
  readonly id: string;
  readonly message: string;
  readonly visibility: WishVisibility;
  readonly status: WishStatus;
  readonly locale: WishLocale;
  readonly createdAt: string;
  readonly approvedAt: string | null;
}

export interface PublicWish {
  readonly id: string;
  readonly message: string;
  readonly locale: WishLocale;
}

export interface NewWish {
  readonly message: string;
  readonly visibility: WishVisibility;
  readonly locale: WishLocale;
  readonly submitterHash: string | null;
}
