export interface ProductViewModel {
  readonly id: string;
  readonly slug: string;
  readonly badge: string;
  readonly name: string;
  readonly priceKrw: number;
  readonly imageUrl: string;
  readonly altText: string;
  readonly description: string;
  readonly sortOrder: number;
}

export interface ProductCatalogNotices {
  readonly donationNote: string;
  readonly inquiryNote: string;
}

export const DEFAULT_PRODUCT_NOTICES: ProductCatalogNotices = {
  donationNote:
    "수익분기점 달성 이후 수익의 10%를 기부합니다. 기부 소식은 추후 생성될 자사 홈페이지 채널을 통해 전달합니다.",
  inquiryNote: "결제 기능 준비 중에 있습니다.",
};

export const DEFAULT_PRODUCTS: readonly ProductViewModel[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "basic-ballpoint",
    badge: "베이직",
    name: "볼펜",
    priceKrw: 1400,
    imageUrl: "/images/products/basic-ballpoint.webp",
    altText: "검정, 초록, 파랑, 버건디 색상의 HOPE 로고 볼펜 네 자루",
    description: "일상에서 가볍게 꺼내 쓰기 좋은 HOPE 베이직 볼펜입니다.",
    sortOrder: 10,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "limited-mother-of-pearl-fountain-pen",
    badge: "한정판",
    name: "자개 만년필",
    priceKrw: 80000,
    imageUrl: "/images/products/limited-fountain-pen.webp",
    altText: "검은색 바디와 금색 펜촉으로 구성된 HOPE 한정판 자개 만년필",
    description:
      "깊은 광택과 섬세한 디테일을 담은 HOPE 한정판 자개 만년필입니다.",
    sortOrder: 20,
  },
] as const;
