import type { APIRoute } from "astro";
import { verifyAdminRequest } from "../../../server/admin-auth";
import { adminEnvironment } from "../../../server/admin-environment";
import { readFormText } from "../../../server/form-data";
import { hidePublicWish } from "../../../server/admin-wishes";
import { verifyAdminCsrfToken } from "../../../server/security/csrf";
import { isTrustedAdminMutationRequest } from "../../../server/security/request-origin";

export const prerender = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isTrustedAdminMutationRequest(request)) {
    return redirect("/admin?error=forbidden#wishes", 303);
  }

  const environment = adminEnvironment();
  const auth = verifyAdminRequest(request, environment);
  if (!auth.configured) return redirect("/admin?error=not-configured", 303);
  if (!auth.authorized) return redirect("/admin?error=session-expired", 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect("/admin?error=invalid-request#wishes", 303);
  }

  if (!verifyAdminCsrfToken(request, form, environment)) {
    return redirect("/admin?error=csrf-failed#wishes", 303);
  }

  const id = readFormText(form, "id").trim();
  const action = readFormText(form, "action").trim();
  const moderationNote = readFormText(form, "moderationNote").trim();

  if (!UUID_PATTERN.test(id)) {
    return redirect("/admin?error=invalid-wish-id#wishes", 303);
  }
  if (action !== "hide") {
    return redirect("/admin?error=invalid-wish-action#wishes", 303);
  }
  if (moderationNote.length > 200) {
    return redirect("/admin?error=invalid-wish-note#wishes", 303);
  }

  try {
    await hidePublicWish(environment, {
      id,
      moderationNote: moderationNote || null,
    });
    return redirect("/admin?result=wish-hidden#wishes", 303);
  } catch (error) {
    console.error("Admin wish visibility update failed", error);
    return redirect("/admin?error=wish-action-failed#wishes", 303);
  }
};
