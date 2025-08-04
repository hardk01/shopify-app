import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import {
  AppProvider as PolarisProvider,
} from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import en from "@shopify/polaris/locales/en.json";
export const links = () => [{ rel: "stylesheet", href: polarisStyles }];
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
    shop: session.shop,
  });
};

export default function App() {
  const { apiKey } = useLoaderData();
  return (
    <PolarisProvider i18n={en}>
      <AppProvider isEmbeddedApp apiKey={apiKey}>
        <NavMenu>
          <Link to="/app/images">Image Compression</Link>
          <Link to="/app/webP">WebP Conversion</Link>
          <Link to="/app/alt">Set ALT Tag</Link>
          <Link to="/app/contact">Contact Us</Link>
          <Link to="/app/billing">Pricing</Link>
        </NavMenu>
        <Outlet />
      </AppProvider>
    </PolarisProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
