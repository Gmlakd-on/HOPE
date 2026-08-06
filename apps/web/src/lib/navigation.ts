import { byId, query, queryAll } from "./dom";
import { FocusModal } from "./focus-modal";

const validRoutes = new Set(["home", "digital", "stories", "objects"] as const);
type Route = "home" | "digital" | "stories" | "objects";

function routeFromHash(): Route {
  const route = window.location.hash.replace(/^#\/?/, "").trim();
  return validRoutes.has(route as Route) ? (route as Route) : "home";
}

export function initializeNavigation(): FocusModal {
  const views = queryAll<HTMLElement>("[data-view]");
  const routeButtons = queryAll<HTMLButtonElement>("[data-route]");
  const aboutModal = new FocusModal(byId("aboutModal"), "#aboutClose");
  const aboutOpen = byId<HTMLButtonElement>("aboutOpen");
  const introAboutOpen = byId<HTMLButtonElement>("introAboutOpen");

  const setRoute = (route: Route, updateHash = true): void => {
    const nextRoute = validRoutes.has(route) ? route : "home";
    for (const view of views) {
      const active = view.dataset.view === nextRoute;
      view.classList.toggle("is-active", active);
      view.hidden = !active;
      view.setAttribute("aria-hidden", String(!active));
    }
    for (const button of routeButtons) {
      const selected =
        button.dataset.route === nextRoute && nextRoute !== "home";
      button.setAttribute("aria-selected", String(selected));
    }
    if (updateHash) {
      const nextHash = nextRoute === "home" ? "" : `#${nextRoute}`;
      if (window.location.hash !== nextHash) {
        history.pushState(
          { route: nextRoute },
          "",
          `${location.pathname}${location.search}${nextHash}`,
        );
      }
    }
    window.dispatchEvent(
      new CustomEvent("hope-route-change", { detail: { route: nextRoute } }),
    );
  };

  for (const button of routeButtons) {
    button.addEventListener("click", () => {
      const clicked = (button.dataset.route ?? "home") as Route;
      setRoute(clicked === routeFromHash() ? "home" : clicked);
    });
  }

  document.addEventListener("click", (event) => {
    if (routeFromHash() === "home") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".archive-shell, .site-header, .site-footer, .modal"))
      return;
    setRoute("home");
  });

  window.addEventListener("hashchange", () => setRoute(routeFromHash(), false));
  window.addEventListener("popstate", () => setRoute(routeFromHash(), false));
  aboutOpen.addEventListener("click", () => aboutModal.open());
  introAboutOpen.addEventListener("click", () => aboutOpen.click());

  const serviceLink = query<HTMLAnchorElement>("#serviceLink");
  serviceLink.addEventListener("click", (event) => {
    if (!serviceLink.href || serviceLink.getAttribute("href") === "#")
      event.preventDefault();
  });

  setRoute(routeFromHash(), false);
  return aboutModal;
}
