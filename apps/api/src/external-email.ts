const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function externalInvitation(
  title: string,
  link: string,
  expiresAt: Date,
) {
  const expiry = expiresAt
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC");
  return {
    subject: "You're invited to complete a form",
    text: `You've been invited to complete ${title}.\n\nOpen form: ${link}\n\nPlease complete and submit the form yourself. Your answers go directly to HR.\nThis private link expires at ${expiry}. Please do not forward it.`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0f172a; line-height: 1.5;">
  <div style="margin-bottom: 24px;">
    <span style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #0f172a;">NOLT HR</span>
  </div>
  <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 12px; color: #0f172a;">Form invitation</h1>
  <p style="font-size: 15px; color: #334155; margin: 0 0 24px;">
    You've been invited to complete <strong>${escape(title)}</strong>.
  </p>
  <div style="margin: 28px 0;">
    <a href="${escape(link)}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">Open form</a>
  </div>
  <p style="font-size: 14px; color: #64748b; margin: 0 0 8px;">
    Please complete and submit the form yourself. Your answers go directly to HR.
  </p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
  <p style="font-size: 12px; color: #94a3b8; margin: 0;">
    This private link expires at ${escape(expiry)}. Please do not forward it.
  </p>
</div>`,
  };
}
