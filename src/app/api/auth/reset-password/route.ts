import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPasswordResetToken } from "@/lib/password-reset";

export const runtime = "nodejs";

function isValidPassword(value: string): boolean {
  return value.length > 6 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  const payload = (await request.json()) as {
    token?: string;
    password?: string;
    confirmPassword?: string;
  };

  const token = payload?.token?.trim();
  const password = payload?.password;
  const confirmPassword = payload?.confirmPassword;

  if (!token || !password || !confirmPassword) {
    return NextResponse.json(
      { error: "Reset token, password, and confirm password are required." },
      { status: 400 },
    );
  }

  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: "Password must be >6 chars and include letters and numbers." },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.passwordResetTokenHash, tokenHash),
        gt(users.passwordResetTokenExpiresAt, now),
      ),
    )
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "Reset token is invalid or has expired." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .update(users)
    .set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
