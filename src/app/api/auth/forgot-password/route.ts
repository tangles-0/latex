import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  getPasswordResetExpiryDate,
  sendPasswordResetEmail,
} from "@/lib/password-reset";

export const runtime = "nodejs";

const GENERIC_SUCCESS_MESSAGE =
  "If an account with that email exists, a password reset link has been sent.";
const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export async function POST(request: Request): Promise<NextResponse> {
  const payload = (await request.json()) as { email?: string };
  const email = payload?.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Email format is invalid." }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
  }

  const { token, tokenHash } = createPasswordResetToken();
  const tokenExpiresAt = getPasswordResetExpiryDate();

  await db
    .update(users)
    .set({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: tokenExpiresAt,
    })
    .where(eq(users.id, user.id));

  const resetUrl = buildPasswordResetUrl(request, token);
  let emailSent = false;
  try {
    emailSent = await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
    });
  } catch (error) {
    console.error("[password-reset] Failed to send reset email.", error);
  }

  if (!emailSent && process.env.NODE_ENV !== "production") {
    console.info("[password-reset] Resend is not configured. Reset link:", resetUrl);
  }

  return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE, emailSent });
}
