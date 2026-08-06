import type {
  ProductCatalogNotices,
  ProductViewModel,
} from "../lib/product-defaults";
import {
  readSupabaseError,
  resolveSupabaseRestConfig,
  supabaseHeaders,
  supabaseRestUrl,
  type SupabaseEnvironment,
} from "./supabase-rest";

export interface AdminProduct extends ProductViewModel {
  readonly isPublished: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProductRow {
  id: string;
  slug: string;
  badge: string;
  name: string;
  price_krw: number;
  image_url: string;
  alt_text: string;
  description: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductCatalogSettingsRow {
  id: number;
  donation_note: string;
  inquiry_note: string;
  updated_at: string;
}

export interface ProductWriteInput {
  readonly id?: string;
  readonly slug: string;
  readonly badge: string;
  readonly name: string;
  readonly priceKrw: number;
  readonly imageUrl: string;
  readonly altText: string;
  readonly description: string;
  readonly sortOrder: number;
  readonly isPublished: boolean;
}

function toProduct(row: ProductRow): AdminProduct {
  return {
    id: row.id,
    slug: row.slug,
    badge: row.badge,
    name: row.name,
    priceKrw: row.price_krw,
    imageUrl: row.image_url,
    altText: row.alt_text,
    description: row.description,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function productPayload(input: ProductWriteInput) {
  return {
    slug: input.slug,
    badge: input.badge,
    name: input.name,
    price_krw: input.priceKrw,
    image_url: input.imageUrl,
    alt_text: input.altText,
    description: input.description,
    sort_order: input.sortOrder,
    is_published: input.isPublished,
  };
}

async function listProducts(
  environment: SupabaseEnvironment,
  publishedOnly: boolean,
): Promise<readonly AdminProduct[]> {
  const config = resolveSupabaseRestConfig(environment);
  const url = supabaseRestUrl(config, "products");
  url.searchParams.set(
    "select",
    "id,slug,badge,name,price_krw,image_url,alt_text,description,sort_order,is_published,created_at,updated_at",
  );
  if (publishedOnly) url.searchParams.set("is_published", "eq.true");
  url.searchParams.set("order", "sort_order.asc,created_at.asc");

  const response = await fetch(url, {
    headers: supabaseHeaders(config),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to list products: ${await readSupabaseError(response)}`);
  }
  return ((await response.json()) as ProductRow[]).map(toProduct);
}

export async function listPublishedProducts(
  environment: SupabaseEnvironment,
): Promise<readonly ProductViewModel[]> {
  return listProducts(environment, true);
}

export async function listAdminProducts(
  environment: SupabaseEnvironment,
): Promise<readonly AdminProduct[]> {
  return listProducts(environment, false);
}

export async function getProductCatalogNotices(
  environment: SupabaseEnvironment,
): Promise<ProductCatalogNotices> {
  const config = resolveSupabaseRestConfig(environment);
  const url = supabaseRestUrl(config, "product_catalog_settings");
  url.searchParams.set("select", "id,donation_note,inquiry_note,updated_at");
  url.searchParams.set("id", "eq.1");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: supabaseHeaders(config),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load product catalog notices: ${await readSupabaseError(response)}`,
    );
  }

  const rows = (await response.json()) as ProductCatalogSettingsRow[];
  const row = rows[0];
  if (!row) throw new Error("Product catalog settings were not found.");
  return {
    donationNote: row.donation_note,
    inquiryNote: row.inquiry_note,
  };
}

export async function updateProductCatalogNotices(
  environment: SupabaseEnvironment,
  notices: ProductCatalogNotices,
): Promise<void> {
  const config = resolveSupabaseRestConfig(environment);
  const url = supabaseRestUrl(config, "product_catalog_settings");
  url.searchParams.set("id", "eq.1");

  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(config, {
      "content-type": "application/json",
      prefer: "return=representation",
    }),
    body: JSON.stringify({
      donation_note: notices.donationNote,
      inquiry_note: notices.inquiryNote,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Failed to update product catalog notices: ${await readSupabaseError(response)}`,
    );
  }

  const rows = (await response.json()) as unknown[];
  if (rows.length !== 1) throw new Error("Product catalog settings were not found.");
}

export async function createProduct(
  environment: SupabaseEnvironment,
  input: ProductWriteInput,
): Promise<void> {
  const config = resolveSupabaseRestConfig(environment);
  const response = await fetch(supabaseRestUrl(config, "products"), {
    method: "POST",
    headers: supabaseHeaders(config, {
      "content-type": "application/json",
      prefer: "return=minimal",
    }),
    body: JSON.stringify(productPayload(input)),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to create product: ${await readSupabaseError(response)}`);
  }
}

export async function updateProduct(
  environment: SupabaseEnvironment,
  input: ProductWriteInput & { readonly id: string },
): Promise<void> {
  const config = resolveSupabaseRestConfig(environment);
  const url = supabaseRestUrl(config, "products");
  url.searchParams.set("id", `eq.${input.id}`);
  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(config, {
      "content-type": "application/json",
      prefer: "return=representation",
    }),
    body: JSON.stringify(productPayload(input)),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to update product: ${await readSupabaseError(response)}`);
  }
  const rows = (await response.json()) as unknown[];
  if (rows.length !== 1) throw new Error("Product was not found.");
}

export async function deleteProduct(
  environment: SupabaseEnvironment,
  id: string,
): Promise<void> {
  const config = resolveSupabaseRestConfig(environment);
  const url = supabaseRestUrl(config, "products");
  url.searchParams.set("id", `eq.${id}`);
  const response = await fetch(url, {
    method: "DELETE",
    headers: supabaseHeaders(config, { prefer: "return=representation" }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete product: ${await readSupabaseError(response)}`);
  }
  const rows = (await response.json()) as unknown[];
  if (rows.length !== 1) throw new Error("Product was not found.");
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4_096;
const MAX_IMAGE_PIXELS = 16_000_000;
const PUBLIC_PRODUCT_IMAGE_PREFIX = "/images/products/";
const STORAGE_PRODUCT_IMAGE_PREFIX =
  "/storage/v1/object/public/product-images/";

interface DetectedProductImage {
  readonly extension: "jpg" | "png" | "webp";
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
  readonly width: number;
  readonly height: number;
}

function assertImageDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("상품 이미지 해상도가 허용 범위를 벗어났습니다.");
  }
}

function detectPng(bytes: Uint8Array): DetectedProductImage | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length < 24 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  assertImageDimensions(width, height);
  return { extension: "png", mimeType: "image/png", width, height };
}

function detectJpeg(bytes: Uint8Array): DetectedProductImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset] ?? 0;
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;

    const segmentLength =
      ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) break;
      const height =
        ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width =
        ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      assertImageDimensions(width, height);
      return { extension: "jpg", mimeType: "image/jpeg", width, height };
    }

    offset += segmentLength;
  }

  throw new Error("손상되었거나 지원하지 않는 JPEG 이미지입니다.");
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function detectWebp(bytes: Uint8Array): DetectedProductImage | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) {
    return null;
  }

  const chunkType = ascii(bytes, 12, 4);
  let width = 0;
  let height = 0;

  if (chunkType === "VP8X") {
    width = readUint24LittleEndian(bytes, 24) + 1;
    height = readUint24LittleEndian(bytes, 27) + 1;
  } else if (chunkType === "VP8L") {
    if (bytes[20] !== 0x2f || bytes.length < 25) {
      throw new Error("손상된 WEBP 이미지입니다.");
    }
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    width = 1 + (((b2 & 0x3f) << 8) | b1);
    height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
  } else if (chunkType === "VP8 ") {
    if (
      bytes.length < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      throw new Error("손상된 WEBP 이미지입니다.");
    }
    width = ((bytes[27] ?? 0) << 8 | (bytes[26] ?? 0)) & 0x3fff;
    height = ((bytes[29] ?? 0) << 8 | (bytes[28] ?? 0)) & 0x3fff;
  } else {
    throw new Error("지원하지 않는 WEBP 이미지 형식입니다.");
  }

  assertImageDimensions(width, height);
  return { extension: "webp", mimeType: "image/webp", width, height };
}

function detectProductImage(bytes: Uint8Array): DetectedProductImage {
  return (
    detectPng(bytes) ??
    detectJpeg(bytes) ??
    detectWebp(bytes) ??
    (() => {
      throw new Error("PNG, JPG, WEBP 이미지만 업로드할 수 있습니다.");
    })()
  );
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function normalizeProductImageUrl(
  environment: SupabaseEnvironment,
  value: string,
  requestUrl: string,
): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_000) {
    throw new Error("상품 이미지 URL이 올바르지 않습니다.");
  }
  if (/[\u0000-\u001f\u007f\\]/.test(normalized)) {
    throw new Error("상품 이미지 URL이 올바르지 않습니다.");
  }

  const requestOrigin = new URL(requestUrl).origin;
  if (normalized.startsWith("/")) {
    if (normalized.startsWith("//")) {
      throw new Error("상품 이미지 URL이 올바르지 않습니다.");
    }
    const url = new URL(normalized, requestOrigin);
    if (
      url.origin !== requestOrigin ||
      !url.pathname.startsWith(PUBLIC_PRODUCT_IMAGE_PREFIX) ||
      url.search ||
      url.hash
    ) {
      throw new Error("허용되지 않은 상품 이미지 경로입니다.");
    }
    return url.pathname;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("상품 이미지 URL이 올바르지 않습니다.");
  }

  const supabaseOrigin = new URL(resolveSupabaseRestConfig(environment).url).origin;
  if (
    url.origin !== supabaseOrigin ||
    !url.pathname.startsWith(STORAGE_PRODUCT_IMAGE_PREFIX) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("허용되지 않은 상품 이미지 URL입니다.");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("상품 이미지 URL은 HTTPS를 사용해야 합니다.");
  }

  return url.toString();
}

export async function uploadProductImage(
  environment: SupabaseEnvironment,
  file: File,
): Promise<string> {
  if (file.size <= 0) throw new Error("이미지 파일이 비어 있습니다.");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("상품 이미지는 5MB 이하여야 합니다.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) {
    throw new Error("상품 이미지 파일을 읽지 못했습니다.");
  }

  const detected = detectProductImage(bytes);
  if (file.type && file.type !== detected.mimeType) {
    throw new Error("파일 확장자와 실제 이미지 형식이 일치하지 않습니다.");
  }

  const config = resolveSupabaseRestConfig(environment);
  const objectPath = `products/${crypto.randomUUID()}.${detected.extension}`;
  const uploadUrl = new URL(
    `/storage/v1/object/product-images/${encodeStoragePath(objectPath)}`,
    `${config.url}/`,
  );
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: supabaseHeaders(config, {
      "content-type": detected.mimeType,
      "x-upsert": "false",
    }),
    body: bytes,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Failed to upload product image: ${await readSupabaseError(response)}`,
    );
  }

  return new URL(
    `/storage/v1/object/public/product-images/${objectPath}`,
    `${config.url}/`,
  ).toString();
}
