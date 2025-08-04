import { redirect } from "@remix-run/node";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return redirect("https://admin.shopify.com");
  }
  // Redirect to the embedded app inside Shopify admin
  return redirect(`https://admin.shopify.com/store/${shop}/apps/sbit-image-compres-and-webp`);
}; 