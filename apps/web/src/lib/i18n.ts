import { byId, query, queryAll } from "./dom";
import { SITE_TITLE_EN, SITE_TITLE_KO } from "../config/site";

export type Language = "ko" | "en";

export interface Copy {
  pageTitle: string;
  service: string;
  content: string;
  product: string;
  slogan: string;
  question: string;
  leaveWish: string;
  serviceDescription: string;
  contentDescription: string;
  productDescription: string;
  empty: string;
  projectStatus: string;
  projectAvailability: string;
  projectTitle: string;
  projectDescription: string;
  openService: string;
  wishTitle: string;
  wishDescription: string;
  wishLabel: string;
  privacyNote: string;
  wishPlaceholder: string;
  visibility: string;
  public: string;
  publicHelp: string;
  private: string;
  privateHelp: string;
  visibilityHelp: string;
  submit: string;
  submitting: string;
  successPublicTitle: string;
  successPublicMessage: string;
  successPrivateTitle: string;
  successPrivateMessage: string;
  successConfirm: string;
  successCloseLabel: string;
  submitError: string;
  aboutTitle: string;
  aboutLead: string;
  aboutPillars: string;
  aboutClosing: string;
  aboutSupport: string;
  aboutThanks: string;
  aboutSignoff: string;
  productEmpty: string;
  productDetailsLabel: string;
  productDonationTitle: string;
  productDonationNote: string;
  productPurchaseTitle: string;
  productPurchaseNotice: string;
  productContactLabel: string;
  productInstagramLabel: string;
  productEmailLabel: string;
}

const copy: Record<Language, Copy> = {
  ko: {
    pageTitle: SITE_TITLE_KO,
    service: "서비스",
    content: "콘텐츠",
    product: "제품",
    slogan:
      '<span class="tagline-line">입고, 쓰고, 읽는</span><span class="tagline-line tagline-line--indent">오늘의 희망</span>',
    question: "당신이 지금 바라는 것은 무엇인가요?",
    leaveWish: '소원 남기기 <span aria-hidden="true">↗</span>',
    serviceDescription:
      '<span class="archive-quote" aria-hidden="true">“</span><span class="archive-description-copy"><span class="archive-description-line">건강한 삶을 지속할 수 있는 디지털 기반을</span><span class="archive-description-line">만듭니다</span></span><span class="archive-quote" aria-hidden="true">”</span>',
    contentDescription:
      '<span class="archive-quote" aria-hidden="true">“</span><span class="archive-description-copy"><span class="archive-description-line">사람과 사회에 필요한 관점을 담은</span><span class="archive-description-line">콘텐츠를 제작합니다</span></span><span class="archive-quote" aria-hidden="true">”</span>',
    productDescription:
      '<span class="archive-quote" aria-hidden="true">“</span><span class="archive-description-copy"><span class="archive-description-line">희망의 가치를 담은 실용적인 제품을</span><span class="archive-description-line">만듭니다</span></span><span class="archive-quote" aria-hidden="true">”</span>',
    empty: "현재 공개 중인 프로젝트가 없습니다.",
    projectStatus: "NEW",
    projectAvailability: "앱 출시 준비중",
    projectTitle: "참 잘했어요",
    projectDescription: "일상 기록, 나를 알아가는 라이프스타일 서비스",
    openService:
      '<span class="project-cta-label">서비스 사이트 보기</span><span class="project-cta-arrow" aria-hidden="true">↗</span>',
    wishTitle: "당신의 소원을 남겨주세요.",
    wishDescription:
      "공개를 선택한 소원은 저장되는 즉시 메인 화면의 비눗방울로 떠오릅니다.",
    wishLabel: "소원",
    privacyNote: "개인정보는 적지 말아주세요.",
    wishPlaceholder: "언젠가 꼭 이루고 싶은 것은...",
    visibility: "공개 설정",
    public: "공개",
    publicHelp: "저장되는 즉시 비눗방울로 공개됩니다.",
    private: "비공개",
    privateHelp: "외부에 공개하지 않고 조용히 보관합니다.",
    visibilityHelp: "공개와 비공개 중 하나를 선택해 주세요.",
    submit: "소원 띄우기",
    submitting: "소원 보내는 중",
    successPublicTitle: "당신의 소원을 잘 받았어요.",
    successPublicMessage:
      "방금 적은 소원이 이곳의 비눗방울로 바로 떠오릅니다.",
    successPrivateTitle: "당신의 소원을 조용히 간직할게요.",
    successPrivateMessage:
      "비공개 소원은 비눗방울로 표시되지 않으며 외부에 공개되지 않습니다.",
    successConfirm: "확인",
    successCloseLabel: "완료 알림 닫기",
    submitError: "소원을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    aboutTitle: "어둠을 알기에, 우리는 희망을 만듭니다.",
    aboutLead:
      "HOPE는 희망을 막연한 낙관이 아닌, 작은 마음과 행동이 쌓여 삶과 세상을 변화시키는 과정이라 믿습니다.",
    aboutPillars:
      "우리는 희망을 서비스로 경험하게 하고, 콘텐츠로 나누며<br> 제품으로 일상에 남깁니다.",
    aboutClosing:
      "서로를 살피는 마음이 다시 나에게 돌아오는 세상을 향해,<br> 한 걸음씩 나아가겠습니다.",
    aboutSupport:
      "앞으로 이어질 HOPE의 발자취에 따뜻한 관심과 응원으로<br> 함께해 주세요.",
    aboutThanks: "감사합니다.",
    aboutSignoff: "대표 김지은",
    productEmpty: "현재 공개 중인 상품이 없습니다.",
    productDetailsLabel: "상세 정보 보기",
    productDonationTitle: "기부 안내",
    productDonationNote:
      "수익분기점 달성 이후 수익의 10%를 기부합니다. 기부 소식은 추후 생성될 자사 홈페이지 채널을 통해 전달합니다.",
    productPurchaseTitle: "구매 안내",
    productPurchaseNotice: "결제 기능 준비 중에 있습니다.",
    productContactLabel: "관련 문의 :",
    productInstagramLabel: "Instagram으로 문의하기",
    productEmailLabel: "Email로 문의하기",
  },
  en: {
    pageTitle: SITE_TITLE_EN,
    service: "Services",
    content: "Content",
    product: "Products",
    slogan:
      '<span class="tagline-line">Hope for today—</span><span class="tagline-line">to wear, use, and read.</span>',
    question: "What are you wishing for today?",
    leaveWish: 'Make a Wish <span aria-hidden="true">↗</span>',
    serviceDescription:
      '<span class="archive-quote" aria-hidden="true">“</span><span class="archive-description-copy"><span class="archive-description-line">We build digital foundations for healthier,</span><span class="archive-description-line">more sustainable lives</span></span><span class="archive-quote" aria-hidden="true">”</span>',
    contentDescription:
      '<span class="archive-quote" aria-hidden="true">“</span><span class="archive-description-copy"><span class="archive-description-line">We create content that offers perspectives</span><span class="archive-description-line">people and society need</span></span><span class="archive-quote" aria-hidden="true">”</span>',
    productDescription:
      '<span class="archive-quote" aria-hidden="true">“</span><span class="archive-description-copy"><span class="archive-description-line">We make practical products inspired</span><span class="archive-description-line">by the value of hope</span></span><span class="archive-quote" aria-hidden="true">”</span>',
    empty: "There are no projects to explore at the moment.",
    projectStatus: "NEW",
    projectAvailability: "App launch coming soon",
    projectTitle: "GOLD STAR",
    projectDescription:
      "A lifestyle service for recording and sharing emotions and everyday moments.",
    openService:
      '<span class="project-cta-label">Visit service site</span><span class="project-cta-arrow" aria-hidden="true">↗</span>',
    wishTitle: "Share your wish with us.",
    wishDescription:
      "Public wishes rise as bubbles as soon as they are saved.",
    wishLabel: "Wish",
    privacyNote: "Please don’t include personal information.",
    wishPlaceholder: "Someday, I hope to...",
    visibility: "Visibility",
    public: "Public",
    publicHelp: "Your wish will be published immediately as a bubble.",
    private: "Private",
    privateHelp: "Your wish will be stored privately and never published.",
    visibilityHelp: "Please choose either Public or Private.",
    submit: "Release My Wish",
    submitting: "Sending Wish",
    successPublicTitle: "We’ve received your wish.",
    successPublicMessage: "Your wish is now rising here as a bubble.",
    successPrivateTitle: "We’ll keep your wish quietly.",
    successPrivateMessage:
      "Private wishes will never appear as bubbles or be shared publicly.",
    successConfirm: "Done",
    successCloseLabel: "Close completion notice",
    submitError: "We couldn’t save your wish. Please try again shortly.",
    aboutTitle: "Because we know darkness, we create hope.",
    aboutLead:
      "At HOPE, we believe that hope is not simply blind optimism. It is a process—one in which small acts of care and intention come together to transform our lives and the world around us.",
    aboutPillars:
      "We bring hope to life through our services, share it through our content, and make it part of everyday life through our products.",
    aboutClosing:
      "We will continue moving forward, one step at a time, toward a world where the care we show one another finds its way back to us.",
    aboutSupport:
      "We invite you to join us with your warmth and support as HOPE continues its journey.",
    aboutThanks: "Thank you.",
    aboutSignoff: "Jieun Kim<br>CEO",
    productEmpty: "There are no products available at the moment.",
    productDetailsLabel: "View product details",
    productDonationTitle: "Our Giving Pledge (Donation Info)",
    productDonationNote:
      "Once we reach our break-even point, 10% of all profits will be donated. We will share updates on our donation initiatives through our upcoming official website.",
    productPurchaseTitle: "Notice",
    productPurchaseNotice:
      "Our checkout system and shopping cart feature are currently under development.",
    productContactLabel: "For purchases or inquiries:",
    productInstagramLabel: "Contact us on Instagram",
    productEmailLabel: "Contact us by Email",
  },
};

let currentLanguage: Language = "ko";

function savedLanguage(): Language {
  try {
    return localStorage.getItem("hope-language") === "en" ? "en" : "ko";
  } catch {
    return "ko";
  }
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function getCopy(): Copy {
  return copy[currentLanguage];
}

export function initializeI18n(): void {
  const buttons = queryAll<HTMLButtonElement>("[data-lang]");
  const setText = (selector: string, value: string): void => {
    for (const element of queryAll<HTMLElement>(selector)) {
      element.textContent = value;
    }
  };
  const setHtml = (selector: string, value: string): void => {
    for (const element of queryAll<HTMLElement>(selector)) {
      element.innerHTML = value;
    }
  };

  const apply = (language: Language): void => {
    currentLanguage = language;
    window.HOPE_LANGUAGE = language;
    document.documentElement.lang = language;
    try {
      localStorage.setItem("hope-language", language);
    } catch {
      /* opaque preview origins */
    }

    const strings = copy[language];

    for (const button of buttons) {
      const active = button.dataset.lang === language;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }

    setText('.category-button[data-route="digital"]', strings.service);
    setText('.category-button[data-route="stories"]', strings.content);
    setText('.category-button[data-route="objects"]', strings.product);
    setHtml("#homeTitle", strings.slogan);
    setText(".wish-question", strings.question);
    setHtml("#wishOpen", strings.leaveWish);
    setHtml("#digitalView .archive-description", strings.serviceDescription);
    setHtml("#storiesView .archive-description", strings.contentDescription);
    setHtml("#objectsView .archive-description", strings.productDescription);
    setText("#storiesView .empty-state p", strings.empty);
    setText(".project-status", strings.projectStatus);
    setText(".project-availability", strings.projectAvailability);
    setText(".project-title", strings.projectTitle);
    setText(".project-description", strings.projectDescription);
    setHtml(".project-cta", strings.openService);

    setText("#wishTitle", strings.wishTitle);
    setText(".wish-form-description", strings.wishDescription);
    setHtml(
      ".wish-form .field:first-of-type .field-label",
      `${strings.wishLabel} <strong aria-hidden="true">*</strong>`,
    );
    query<HTMLElement>(
      ".wish-form .field:first-of-type .field-meta > span:first-child",
    ).textContent = strings.privacyNote;
    byId<HTMLTextAreaElement>("wishMessage").placeholder =
      strings.wishPlaceholder;
    setHtml(
      ".wish-visibility legend",
      `${strings.visibility} <strong aria-hidden="true">*</strong>`,
    );
    query<HTMLElement>("#wishPublicOption strong").textContent = strings.public;
    query<HTMLElement>("#wishPublicOption small").textContent =
      strings.publicHelp;
    query<HTMLElement>("#wishPrivateOption strong").textContent =
      strings.private;
    query<HTMLElement>("#wishPrivateOption small").textContent =
      strings.privateHelp;
    setText("#wishVisibilityHelp", strings.visibilityHelp);
    setText(".wish-submit", strings.submit);
    setText("#wishSuccessConfirm", strings.successConfirm);

    setText("#aboutTitle", strings.aboutTitle);
    setText("#aboutLead", strings.aboutLead);
    setHtml("#aboutPillars", strings.aboutPillars);
    setHtml("#aboutClosing", strings.aboutClosing);
    setHtml("#aboutSupport", strings.aboutSupport);
    setText("#aboutThanks", strings.aboutThanks);
    setHtml("#aboutSignoff", strings.aboutSignoff);

    byId<HTMLButtonElement>("wishSuccessClose").setAttribute(
      "aria-label",
      strings.successCloseLabel,
    );
    query<HTMLButtonElement>("#wishSuccessModal .modal-backdrop").setAttribute(
      "aria-label",
      strings.successCloseLabel,
    );

    document.title = strings.pageTitle;
    window.dispatchEvent(
      new CustomEvent("hope-language-change", {
        detail: { language, strings },
      }),
    );
  };

  for (const button of buttons) {
    button.addEventListener("click", () =>
      apply(button.dataset.lang === "en" ? "en" : "ko"),
    );
  }

  apply(savedLanguage());
}
