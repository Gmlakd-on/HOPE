export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing #${id}`);
  return element as T;
}

export function query<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element as T;
}

export function queryAll<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return [...root.querySelectorAll(selector)] as T[];
}

export function debounce<TArgs extends readonly unknown[]>(
  callback: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}
