import { byId, query } from "./dom";
import { FocusModal } from "./focus-modal";
import { MAX_WISH_LENGTH, MIN_WISH_LENGTH } from "@hope/wishes-domain";
import { getCopy, getLanguage } from "./i18n";
import { LazyTurnstile, TurnstileClientError } from "./turnstile";
import { type WishApiClient } from "./wish-api";
import type { BubbleEngine } from "./bubble-engine";

function securityErrorMessage(error: unknown): string {
  const english = getLanguage() === "en";
  if (!(error instanceof TurnstileClientError)) {
    return english
      ? "The security check could not start. Please refresh the page and try again."
      : "보안 확인을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
  }

  if (error.code === "CONFIGURATION_ERROR") {
    const hostname = window.location.hostname;
    if (error.detail === "MISSING_SITE_KEY") {
      return english
        ? "The Turnstile site key is missing from this deployment."
        : "현재 배포에 Turnstile 사이트키가 없습니다. Vercel 환경변수 설정 후 다시 배포해 주세요.";
    }
    if (error.detail === "SITE_KEY_IS_URL") {
      return english
        ? "PUBLIC_TURNSTILE_SITE_KEY contains a domain URL. Enter the Cloudflare widget site key instead."
        : "PUBLIC_TURNSTILE_SITE_KEY에 도메인 URL이 들어가 있습니다. Cloudflare 위젯의 사이트키로 교체해 주세요.";
    }
    if (error.detail === "INVALID_SITE_KEY_VALUE") {
      return english
        ? "PUBLIC_TURNSTILE_SITE_KEY contains an invalid value."
        : "PUBLIC_TURNSTILE_SITE_KEY 값이 올바르지 않습니다. Cloudflare 위젯 사이트키를 확인해 주세요.";
    }
    if (error.detail === "110200") {
      return english
        ? `The domain ${hostname} is not authorized in Cloudflare Turnstile. (110200)`
        : `Cloudflare Turnstile에 ${hostname} 도메인이 등록되지 않았습니다. (110200)`;
    }
    if (error.detail?.startsWith("1101")) {
      return english
        ? `The configured Turnstile site key is invalid. (${error.detail})`
        : `Turnstile 사이트키가 올바르지 않습니다. (${error.detail})`;
    }
    return english
      ? `The security check configuration is invalid.${error.detail ? ` (${error.detail})` : ""}`
      : `보안 확인 설정이 올바르지 않습니다.${error.detail ? ` (${error.detail})` : ""}`;
  }
  if (error.code === "SCRIPT_LOAD_FAILED") {
    return english
      ? "The security service could not load. Disable content blocking for this site and try again."
      : "보안 확인 서버를 불러오지 못했습니다. 이 사이트의 콘텐츠 차단을 해제한 뒤 다시 시도해 주세요.";
  }
  return english
    ? "The security check was not completed. Please complete the check and try again."
    : "보안 확인이 완료되지 않았습니다. 확인 절차를 마친 뒤 다시 시도해 주세요.";
}

export function initializeWishForm(
  api: WishApiClient,
  bubbles: BubbleEngine,
): void {
  const root = byId<HTMLElement>("wishModal");
  const form = byId<HTMLFormElement>("wishForm");
  const modal = new FocusModal(root, "#wishClose");
  const openButton = byId<HTMLButtonElement>("wishOpen");
  const message = byId<HTMLTextAreaElement>("wishMessage");
  const count = byId<HTMLElement>("wishCount");
  const publicInput = byId<HTMLInputElement>("wishPublic");
  const privateInput = byId<HTMLInputElement>("wishPrivate");
  const publicOption = byId<HTMLElement>("wishPublicOption");
  const privateOption = byId<HTMLElement>("wishPrivateOption");
  const successRoot = byId<HTMLElement>("wishSuccessModal");
  const successModal = new FocusModal(successRoot, "#wishSuccessClose");
  const successTitle = byId<HTMLElement>("wishSuccessTitle");
  const successMessage = byId<HTMLElement>("wishSuccessMessage");
  const successConfirm = byId<HTMLButtonElement>("wishSuccessConfirm");
  const error = byId<HTMLElement>("wishFormError");
  const submit = query<HTMLButtonElement>(".wish-submit", form);
  const turnstile = new LazyTurnstile(form.dataset.turnstileSiteKey ?? "");

  const updateVisibility = (): void => {
    publicOption.classList.toggle("is-selected", publicInput.checked);
    privateOption.classList.toggle("is-selected", privateInput.checked);
  };

  const selectVisibility = (visibility: "public" | "private"): void => {
    publicInput.checked = visibility === "public";
    privateInput.checked = visibility === "private";
    updateVisibility();
  };

  const reset = (): void => {
    form.reset();
    selectVisibility("private");
    count.textContent = "0";
    error.textContent = "";
    submit.disabled = false;
    submit.textContent = getCopy().submit;
    turnstile.reset();
  };

  openButton.addEventListener("click", () => {
    reset();
    bubbles.pause();
    modal.open(message);
    void turnstile.mount(form).catch(() => undefined);
  });
  successConfirm.addEventListener("click", () => successModal.close());

  root.addEventListener("hope-modal-close", () => {
    bubbles.resume();
    window.setTimeout(reset, 180);
  });

  message.addEventListener("input", () => {
    count.textContent = String(Math.min(message.value.length, MAX_WISH_LENGTH));
  });
  publicInput.addEventListener("change", () => selectVisibility("public"));
  privateInput.addEventListener("change", () => selectVisibility("private"));

  const submitWish = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = message.value.trim();
    if (trimmed.length < MIN_WISH_LENGTH) {
      error.textContent =
        getLanguage() === "en"
          ? `Please enter at least ${MIN_WISH_LENGTH} characters.`
          : `소원을 ${MIN_WISH_LENGTH}자 이상 적어주세요.`;
      message.focus();
      return;
    }

    error.textContent = "";
    submit.disabled = true;
    submit.textContent =
      getLanguage() === "en" ? "Security check" : "보안 확인 중";

    let turnstileToken: string | null = null;
    try {
      turnstileToken = await turnstile.getToken(form);
    } catch (cause) {
      error.textContent = securityErrorMessage(cause);
      submit.disabled = false;
      submit.textContent = getCopy().submit;
      return;
    }

    submit.textContent = getCopy().submitting;
    const visibility = publicInput.checked ? "public" : "private";

    try {
      const result = await api.submit({
        message: trimmed,
        visibility,
        locale: getLanguage(),
        turnstileToken,
      });
      const strings = getCopy();
      successTitle.textContent =
        visibility === "public"
          ? strings.successPublicTitle
          : strings.successPrivateTitle;
      successMessage.textContent =
        visibility === "public"
          ? strings.successPublicMessage
          : strings.successPrivateMessage;
      modal.close();

      const submittedPublicWish =
        visibility === "public"
          ? (result.publicWish ??
            (result.status === "approved"
              ? { id: result.id, message: trimmed, locale: getLanguage() }
              : null))
          : null;

      if (submittedPublicWish) bubbles.showImmediately(submittedPublicWish);

      // Give the newly launched public bubble enough time to become visible
      // before the confirmation dialog dims and pauses the background layer.
      const successDelay = visibility === "public" ? 1_250 : 160;
      window.setTimeout(() => successModal.open(successConfirm), successDelay);
      window.setTimeout(() => void bubbles.refresh(), 450);
    } catch (cause) {
      error.textContent =
        cause instanceof Error && cause.message
          ? cause.message
          : getCopy().submitError;
      submit.disabled = false;
      submit.textContent = getCopy().submit;
      turnstile.reset();
    }
  };

  form.addEventListener("submit", (event) => {
    void submitWish(event);
  });

  updateVisibility();
}
