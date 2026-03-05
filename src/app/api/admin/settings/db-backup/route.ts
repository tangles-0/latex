import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { isAdminUser } from "@/lib/metadata-store";
import { createSqlBackupAndStore } from "@/lib/db-sql-backup";

export const runtime = "nodejs";

const IS_ENABLED = true;

export async function POST(): Promise<NextResponse> {
  if (!IS_ENABLED) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const isAdmin = await isAdminUser(userId);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const backup = await createSqlBackupAndStore();
    return NextResponse.json({ backup });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backup failed." },
      { status: 500 },
    );
  }
}

