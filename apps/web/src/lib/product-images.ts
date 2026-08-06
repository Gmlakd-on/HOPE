export type ProductImageUsage = "card" | "modal";

export interface ProductImageAttributes {
  readonly src: string;
  readonly srcSet?: string;
  readonly sizes: string;
  readonly width: number;
  readonly height: number;
}

interface LocalProductImage {
  readonly small: string;
  readonly medium: string;
}

const PRODUCT_IMAGE_WIDTH = 1_122;
const PRODUCT_IMAGE_HEIGHT = 1_402;

const CARD_SIZES =
  "(max-width: 760px) min(38vw, 289px), (max-width: 1244px) calc((100vw - 112px) / 2), 558px";
const MODAL_SIZES =
  "(max-width: 760px) calc(100vw - 24px), min(55vw, 572px)";

const LOCAL_PRODUCT_VARIANTS: Readonly<Record<string, LocalProductImage>> = {
  "/images/products/basic-ballpoint.webp": {
    small: "/images/products/basic-ballpoint-320.webp",
    medium: "/images/products/basic-ballpoint-640.webp",
  },
  "/images/products/limited-fountain-pen.webp": {
    small: "/images/products/limited-fountain-pen-320.webp",
    medium: "/images/products/limited-fountain-pen-640.webp",
  },
};

export function productImageAttributes(
  imageUrl: string,
  usage: ProductImageUsage,
): ProductImageAttributes {
  const variants = LOCAL_PRODUCT_VARIANTS[imageUrl];
  const sizes = usage === "card" ? CARD_SIZES : MODAL_SIZES;

  if (!variants) {
    return {
      src: imageUrl,
      sizes,
      width: PRODUCT_IMAGE_WIDTH,
      height: PRODUCT_IMAGE_HEIGHT,
    };
  }

  return {
    src: usage === "card" ? variants.medium : imageUrl,
    srcSet: [
      `${variants.small} 320w`,
      `${variants.medium} 640w`,
      `${imageUrl} ${PRODUCT_IMAGE_WIDTH}w`,
    ].join(", "),
    sizes,
    width: PRODUCT_IMAGE_WIDTH,
    height: PRODUCT_IMAGE_HEIGHT,
  };
}
