export function readFormText(
  form: FormData,
  name: string,
  fallback = "",
): string {
  const value = form.get(name);
  return typeof value === "string" ? value : fallback;
}
