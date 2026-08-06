import type { APIRoute } from "astro";
import {
  DEFAULT_PRODUCT_NOTICES,
  DEFAULT_PRODUCTS,
} from "../../lib/product-defaults";
import { publicJsonResponse } from "../../server/http-cache";
import {
  getProductCatalogNotices,
  listPublishedProducts,
} from "../../server/products";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const environment = {
      SUPABASE_URL: import.meta.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: import.meta.env.SUPABASE_SECRET_KEY,
    };
    const [items, notices] = await Promise.all([
      listPublishedProducts(environment),
      getProductCatalogNotices(environment),
    ]);

    return publicJsonResponse(
      request,
      { items, notices },
      {
        sharedMaxAgeSeconds: 60,
        staleWhileRevalidateSeconds: 300,
      },
    );
  } catch (error) {
    console.error("GET /api/products failed; using bundled products", error);
    return publicJsonResponse(
      request,
      {
        items: DEFAULT_PRODUCTS,
        notices: DEFAULT_PRODUCT_NOTICES,
        fallback: true,
      },
      {
        sharedMaxAgeSeconds: 15,
        staleWhileRevalidateSeconds: 60,
        additionalHeaders: { "x-hope-fallback": "1" },
      },
    );
  }
};
