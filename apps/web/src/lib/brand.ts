/** Public, build-time branding options for a NOLT HR deployment.
 * Only non-secret NEXT_PUBLIC_* values are permitted here.
 * Set these before building the frontend; redeploy to change branding.
 */
const text = (value: string | undefined, fallback: string, max = 80) => {
  const clean = value?.trim();
  return clean && clean.length <= max ? clean : fallback;
};
const colour = (value: string | undefined, fallback: string) =>
  value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

// Logo must be a same-origin file under apps/web/public; no remote URL or SVG injection.
const logo = (value: string | undefined) =>
  value && /^\/branding\/[a-zA-Z0-9_-]+\.(png|webp|jpg|jpeg)$/.test(value) ? value : null;

export const brand = Object.freeze({
  name: text(process.env.NEXT_PUBLIC_BRAND_NAME, "NOLT", 60),
  tagline: text(process.env.NEXT_PUBLIC_BRAND_TAGLINE, "People", 60),
  productName: text(process.env.NEXT_PUBLIC_PRODUCT_NAME, "HR", 50),
  description: text(process.env.NEXT_PUBLIC_BRAND_DESCRIPTION,
    "Employee onboarding and HR workspace", 160),
  primary: colour(process.env.NEXT_PUBLIC_BRAND_PRIMARY, "#0b63ce"),
  logoPath: logo(process.env.NEXT_PUBLIC_BRAND_LOGO_PATH),
});
