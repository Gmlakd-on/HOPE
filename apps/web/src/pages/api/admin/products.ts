import type { APIRoute } from "astro";
import { verifyAdminRequest } from "../../../server/admin-auth";
import { adminEnvironment } from "../../../server/admin-environment";
import {
  createProduct,
  deleteProduct,
  normalizeProductImageUrl,
  updateProduct,
  updateProductCatalogNotices,
  uploadProductImage,
  type ProductWriteInput,
} from "../../../server/products";
import { readFormText } from "../../../server/form-data";
import { verifyAdminCsrfToken } from "../../../server/security/csrf";
import { isTrustedAdminMutationRequest } from "../../../server/security/request-origin";

export const prerender = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function required(form: FormData, name: string, maxLength: number): string {
  const value = readFormText(form, name).trim();
  if (!value || value.length > maxLength) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function boundedText(
  form: FormData,
  name: string,
  maxLength: number,
  fallback = "",
): string {
  const value = readFormText(form, name, fallback).trim();
  if (value.length > maxLength) throw new Error(`Invalid ${name}.`);
  return value;
}

function integer(
  form: FormData,
  name: string,
  min: number,
  max: number,
): number {
  const raw = readFormText(form, name);
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${name}.`);

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

async function productInput(
  form: FormData,
  request: Request,
  currentImageUrl = "",
): Promise<ProductWriteInput> {
  const environment = adminEnvironment();
  const slug = required(form, "slug", 100).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) throw new Error("Invalid slug.");

  let imageUrl = boundedText(form, "imageUrl", 2_000, currentImageUrl);
  const image = form.get("image");
  if (image instanceof File && image.size > 0) {
    imageUrl = await uploadProductImage(environment, image);
  } else {
    imageUrl = normalizeProductImageUrl(environment, imageUrl, request.url);
  }

  return {
    slug,
    badge: boundedText(form, "badge", 30),
    name: required(form, "name", 100),
    priceKrw: integer(form, "priceKrw", 0, 100_000_000),
    imageUrl,
    altText: boundedText(form, "altText", 300),
    description: boundedText(form, "description", 1_000),
    sortOrder: integer(form, "sortOrder", 0, 10_000),
    isPublished: form.get("isPublished") === "on",
  };
}

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isTrustedAdminMutationRequest(request)) {
    return redirect("/admin?error=forbidden#products", 303);
  }

  const environment = adminEnvironment();
  const auth = verifyAdminRequest(request, environment);
  if (!auth.configured) return redirect("/admin?error=not-configured", 303);
  if (!auth.authorized) return redirect("/admin?error=session-expired", 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect("/admin?error=invalid-request#products", 303);
  }

  if (!verifyAdminCsrfToken(request, form, environment)) {
    return redirect("/admin?error=csrf-failed#products", 303);
  }

  try {
    const action = readFormText(form, "action").trim();
    const id = readFormText(form, "id").trim();

    if (action === "delete") {
      if (!UUID_PATTERN.test(id)) throw new Error("Invalid product id.");
      await deleteProduct(environment, id);
      return redirect("/admin?result=product-deleted#products", 303);
    }

    if (action === "update-notices") {
      await updateProductCatalogNotices(environment, {
        donationNote: boundedText(form, "donationNote", 1_000),
        inquiryNote: boundedText(form, "inquiryNote", 1_000),
      });
      return redirect("/admin?result=product-notices-updated#products", 303);
    }

    const currentImageUrl = boundedText(form, "currentImageUrl", 2_000);
    const input = await productInput(form, request, currentImageUrl);
    if (action === "create") {
      await createProduct(environment, input);
      return redirect("/admin?result=product-created#products", 303);
    }
    if (action === "update") {
      if (!UUID_PATTERN.test(id)) throw new Error("Invalid product id.");
      await updateProduct(environment, { ...input, id });
      return redirect("/admin?result=product-updated#products", 303);
    }
    throw new Error("Unsupported product action.");
  } catch (error) {
    console.error("Admin product action failed", error);
    return redirect("/admin?error=product-action-failed#products", 303);
  }
};
