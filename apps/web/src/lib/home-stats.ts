import { byId } from "./dom";
import { getLanguage } from "./i18n";

interface WishFeedEvent extends CustomEvent<{ total?: number }> {}

const DAY_MS = 86_400_000;

function seoulTodayUtc(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
  );
}

function companyDday(dateValue: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  if (!match) return null;
  const founded = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const difference = Math.floor((seoulTodayUtc() - founded) / DAY_MS);
  return Math.max(0, difference);
}

export function initializeHomeStats(): void {
  const root = byId<HTMLElement>("homeStats");
  const totalElement = byId<HTMLElement>("wishTotalStat");
  const dayElement = byId<HTMLElement>("companyDayStat");
  const foundedDday = companyDday(root.dataset.companyFoundedDate ?? "");
  let total: number | null = null;

  const render = (): void => {
    const english = getLanguage() === "en";
    totalElement.textContent =
      total === null
        ? english
          ? "Counting wishes"
          : "소원 수 확인 중"
        : english
          ? `${total.toLocaleString("en-US")} wishes shared`
          : `${total.toLocaleString("ko-KR")}명이 소원을 남겼어요`;

    dayElement.textContent =
      foundedDday === null
        ? english
          ? "Company founding date not set"
          : "회사 설립일 설정 필요"
        : english
          ? `HOPE D+${foundedDday.toLocaleString("en-US")}`
          : `회사 설립 D+${foundedDday.toLocaleString("ko-KR")}`;
  };

  window.addEventListener("hope-wish-feed", (event) => {
    const value = (event as WishFeedEvent).detail?.total;
    if (typeof value === "number" && Number.isFinite(value)) {
      total = Math.max(0, Math.trunc(value));
      render();
    }
  });
  window.addEventListener("hope-language-change", render);
  render();
}
