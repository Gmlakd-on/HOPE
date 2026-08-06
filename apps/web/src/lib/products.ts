import { byId } from "./dom";
import { FocusModal } from "./focus-modal";
import { getCopy, getLanguage, type Language } from "./i18n";
import type {
  ProductCatalogNotices,
  ProductViewModel,
} from "./product-defaults";
import { productImageAttributes, type ProductImageUsage } from "./product-images";

interface ProductResponse {
  readonly items?: unknown;
  readonly notices?: unknown;
}

interface PresentedProduct {
  readonly badge: string;
  readonly name: string;
  readonly price: string;
  readonly altText: string;
  readonly description: string;
}

const ENGLISH_PRODUCTS: Readonly<
  Record<
    string,
    {
      badge: string;
      name: string;
      price: string;
      altText: string;
      description: string;
    }
  >
> = {
  "basic-ballpoint": {
    badge: "Basic",
    name: "Ballpoint Pen",
    price: "$1.00",
    altText: "Four HOPE Basic Ballpoint Pens in black, green, blue, and burgundy",
    description:
      "The HOPE Basic Ballpoint Pen—perfect for effortless, everyday writing.",
  },
  "limited-mother-of-pearl-fountain-pen": {
    badge: "Limited Edition",
    name: "Mother-of-Pearl Fountain Pen",
    price: "$59.00",
    altText:
      "The HOPE Limited Edition Mother-of-Pearl Fountain Pen with a black body and gold nib",
    description:
      "The HOPE Limited Edition Mother-of-Pearl Fountain Pen, crafted with a deep, lustrous finish and exquisite detail.",
  },
};

function isProduct(value: unknown): value is ProductViewModel {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === "string" &&
    typeof product.slug === "string" &&
    typeof product.badge === "string" &&
    typeof product.name === "string" &&
    typeof product.priceKrw === "number" &&
    Number.isFinite(product.priceKrw) &&
    typeof product.imageUrl === "string" &&
    typeof product.altText === "string" &&
    typeof product.description === "string" &&
    typeof product.sortOrder === "number"
  );
}

function isProductCatalogNotices(value: unknown): value is ProductCatalogNotices {
  if (!value || typeof value !== "object") return false;
  const notices = value as Record<string, unknown>;
  return (
    typeof notices.donationNote === "string" &&
    typeof notices.inquiryNote === "string"
  );
}

function applyProductImage(
  image: HTMLImageElement,
  imageUrl: string,
  usage: ProductImageUsage,
): void {
  const attributes = productImageAttributes(imageUrl, usage);
  image.src = attributes.src;
  image.sizes = attributes.sizes;
  image.width = attributes.width;
  image.height = attributes.height;

  if (attributes.srcSet) image.srcset = attributes.srcSet;
  else image.removeAttribute("srcset");
}

function formatKrw(priceKrw: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(priceKrw);
}

function present(product: ProductViewModel, language: Language): PresentedProduct {
  if (language === "en") {
    const translated = ENGLISH_PRODUCTS[product.slug];
    if (translated) return translated;
  }

  return {
    badge: product.badge,
    name: product.name,
    price: formatKrw(product.priceKrw),
    altText: product.altText,
    description: product.description,
  };
}

function productCard(
  product: ProductViewModel,
  language: Language,
): HTMLButtonElement {
  const strings = getCopy();
  const localized = present(product, language);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "product-card";
  button.dataset.productId = product.id;
  button.setAttribute(
    "aria-label",
    `[${localized.badge}] ${localized.name} ${strings.productDetailsLabel}`,
  );

  const image = document.createElement("img");
  applyProductImage(image, product.imageUrl, "card");
  image.alt = localized.altText;
  image.loading = "lazy";
  image.decoding = "async";

  const cardCopy = document.createElement("span");
  cardCopy.className = "product-card-copy";

  const badge = document.createElement("span");
  badge.className = "product-card-badge";
  badge.textContent = `[${localized.badge}]`;

  const name = document.createElement("strong");
  name.className = "product-card-name";
  name.textContent = localized.name;

  const price = document.createElement("span");
  price.className = "product-card-price";
  price.textContent = localized.price;

  cardCopy.append(badge, name, price);
  button.append(image, cardCopy);
  return button;
}

export function initializeProducts(): void {
  const grid = byId<HTMLElement>("productGrid");
  const modalRoot = byId<HTMLElement>("productModal");
  const modal = new FocusModal(modalRoot, "#productClose");
  const image = byId<HTMLImageElement>("productModalImage");
  const badge = byId<HTMLElement>("productModalBadge");
  const name = byId<HTMLElement>("productModalName");
  const price = byId<HTMLElement>("productModalPrice");
  const description = byId<HTMLElement>("productModalDescription");
  const donationTitle = byId<HTMLElement>("productDonationTitle");
  const donation = byId<HTMLElement>("productCatalogDonation");
  const inquiryTitle = byId<HTMLElement>("productInquiryTitle");
  const inquiry = byId<HTMLElement>("productCatalogInquiry");
  const contactLabel = byId<HTMLElement>("productContactLabel");
  const instagramLink = byId<HTMLAnchorElement>("productInstagramLink");
  const emailLink = byId<HTMLAnchorElement>("productEmailLink");

  let items: readonly ProductViewModel[] = [];
  let activeProductId = "";
  let catalogNotices: ProductCatalogNotices | null = null;
  const products = new Map<string, ProductViewModel>();

  const renderNotices = (): void => {
    const strings = getCopy();
    donationTitle.textContent = strings.productDonationTitle;
    donation.textContent =
      getLanguage() === "ko" && catalogNotices?.donationNote.trim()
        ? catalogNotices.donationNote
        : strings.productDonationNote;
    inquiryTitle.textContent = strings.productPurchaseTitle;
    inquiry.textContent = strings.productPurchaseNotice;
    contactLabel.textContent = strings.productContactLabel;
    instagramLink.setAttribute("aria-label", strings.productInstagramLabel);
    emailLink.setAttribute("aria-label", strings.productEmailLabel);
  };

  const renderProductDetails = (product: ProductViewModel): void => {
    const localized = present(product, getLanguage());
    applyProductImage(image, product.imageUrl, "modal");
    image.alt = localized.altText;
    badge.textContent = `[${localized.badge}]`;
    name.textContent = localized.name;
    price.textContent = localized.price;
    description.textContent = localized.description;
    renderNotices();
  };

  const openProduct = (product: ProductViewModel): void => {
    activeProductId = product.id;
    renderProductDetails(product);
    modal.open();
  };

  const render = (): void => {
    const language = getLanguage();
    const strings = getCopy();
    products.clear();
    grid.replaceChildren();

    for (const product of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
      products.set(product.id, product);
      grid.append(productCard(product, language));
    }

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "product-empty";
      empty.textContent = strings.productEmpty;
      grid.append(empty);
    }

    renderNotices();

    const active = products.get(activeProductId);
    if (active) renderProductDetails(active);
  };

  grid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest<HTMLButtonElement>("[data-product-id]");
    if (!trigger) return;
    const product = products.get(trigger.dataset.productId ?? "");
    if (product) openProduct(product);
  });

  window.addEventListener("hope-language-change", render);

  items = Array.from(
    grid.querySelectorAll<HTMLButtonElement>("[data-product-json]"),
  )
    .map((element) => {
      try {
        return JSON.parse(element.dataset.productJson ?? "null") as unknown;
      } catch {
        return null;
      }
    })
    .filter(isProduct);
  render();

  void fetch("/api/products", {
    headers: { accept: "application/json" },
    cache: "default",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Product API failed: ${response.status}`);
      return (await response.json()) as ProductResponse;
    })
    .then((payload) => {
      if (Array.isArray(payload.items)) {
        items = payload.items.filter(isProduct);
      }
      if (isProductCatalogNotices(payload.notices)) {
        catalogNotices = payload.notices;
      }
      render();
    })
    .catch((error) => {
      console.error("product initialization failed", error);
    });
}
