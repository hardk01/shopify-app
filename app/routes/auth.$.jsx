import { authenticate } from "../shopify.server";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);
    // If authentication succeeds, redirect to the app
    return redirect("/app");
  } catch (error) {
    // If authentication fails, redirect to login
    return redirect("/auth/login");
  }
};

export default function AuthCatchAll() {
  return null; // This should never render as we always redirect
}
