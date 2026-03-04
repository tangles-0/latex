import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";

const DEFAULT_TOKEN_TTL_MINUTES = 30;

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function getPasswordResetExpiryDate(): Date {
  const ttlMinutes = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? DEFAULT_TOKEN_TTL_MINUTES);
  const safeTtlMinutes =
    Number.isFinite(ttlMinutes) && ttlMinutes >= 1 && ttlMinutes <= 24 * 60
      ? ttlMinutes
      : DEFAULT_TOKEN_TTL_MINUTES;
  return new Date(Date.now() + safeTtlMinutes * 60 * 1000);
}

function getPublicAppOrigin(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return new URL(request.url).origin;
}

export function buildPasswordResetUrl(request: Request, token: string): string {
  const origin = getPublicAppOrigin(request);
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return false;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "noreply@latex.gg",
    to: input.to,
    subject: "psswrd rst",
    html: `<p>A password reset was requested for your account.</p><p><a href="${input.resetUrl}">Reset your <strong>password</strong></a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
  return true;
}
