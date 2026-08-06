import { debounce, query } from "./dom";

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Use the document fallback below.
  }

  return fallbackCopy(text);
}

function initializeEmailPopover(): void {
  const toggle = query<HTMLButtonElement>("#footerEmailToggle");
  const popover = query<HTMLElement>("#footerEmailPopover");
  const copyButton = query<HTMLButtonElement>("#footerEmailCopy");
  const copyStatus = query<HTMLElement>("#footerEmailCopyStatus");
  const email = copyButton.dataset.email?.trim() ?? "";
  let resetTimer = 0;

  const close = (restoreFocus = false): void => {
    popover.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    copyButton.classList.remove("is-copied");
    if (restoreFocus) toggle.focus();
  };

  const open = (): void => {
    popover.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (popover.hidden) open();
    else close();
  });

  popover.addEventListener("click", (event) => event.stopPropagation());

  const copyEmail = async (): Promise<void> => {
    if (!email) return;

    const copied = await copyText(email);
    copyButton.classList.toggle("is-copied", copied);
    copyButton.setAttribute(
      "aria-label",
      copied ? "이메일 주소 복사 완료" : "이메일 주소 복사 실패",
    );
    copyStatus.textContent = copied
      ? "이메일 주소가 복사되었습니다."
      : "이메일 주소를 복사하지 못했습니다.";

    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      copyButton.classList.remove("is-copied");
      copyButton.setAttribute("aria-label", "이메일 주소 복사");
      copyStatus.textContent = "";
    }, 1800);
  };

  copyButton.addEventListener("click", () => {
    void copyEmail();
  });

  document.addEventListener("click", () => close());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) close(true);
  });
}

export function initializeFooterBoundary(): void {
  const footer = query<HTMLElement>(".site-footer");
  const sync = (): void => {
    const rect = footer.getBoundingClientRect();
    const offset =
      rect.top < innerHeight
        ? innerHeight - Math.max(0, rect.top)
        : footer.offsetHeight;
    document.documentElement.style.setProperty(
      "--bubble-footer-offset",
      `${Math.max(0, Math.round(offset))}px`,
    );
  };

  sync();
  initializeEmailPopover();
  window.addEventListener("load", sync, { once: true });
  window.addEventListener("resize", debounce(sync, 100), { passive: true });
  window.addEventListener("hope-route-change", () =>
    requestAnimationFrame(sync),
  );
}
