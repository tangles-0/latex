import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { extname } from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSessionUserId } from "@/lib/auth";
import { isAdminUser } from "@/lib/metadata-store";

export const runtime = "nodejs";

const IS_ENABLED = true;

const MAX_DUMP_BYTES = 1024 * 1024 * 1024;
const s3Region = process.env.S3_REGION;
const s3Endpoint = process.env.S3_ENDPOINT;
const s3Bucket = process.env.S3_BUCKET;
const s3Client =
  s3Region && s3Bucket
    ? new S3Client({
        region: s3Region,
        endpoint: s3Endpoint,
        forcePathStyle: Boolean(s3Endpoint),
      })
    : null;

export async function POST(request: Request): Promise<NextResponse> {
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

  const connectionString = resolveConnectionString();
  if (!connectionString) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 500 });
  }

  let sourceKind: "sql" | "dump" = "sql";
  let sourceStream: AsyncIterable<Uint8Array> | null = null;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as { s3Key?: string };
    const s3Key = payload.s3Key?.trim();
    if (!s3Key) {
      return NextResponse.json({ error: "Provide an S3 object key." }, { status: 400 });
    }
    sourceKind = extname(s3Key).toLowerCase() === ".dump" ? "dump" : "sql";
    sourceStream = await getS3ObjectStream(s3Key);
  } else {
    const formData = await request.formData();
    const file = formData.get("dump");
    const s3Key = formData.get("s3Key");

    if (file instanceof File) {
      if (file.size <= 0) {
        return NextResponse.json({ error: "Dump file is empty." }, { status: 400 });
      }
      if (file.size > MAX_DUMP_BYTES) {
        return NextResponse.json(
          { error: "Dump file is too large (max 1 GB)." },
          { status: 400 },
        );
      }
      sourceKind = extname(file.name || "upload.sql").toLowerCase() === ".dump" ? "dump" : "sql";
      sourceStream = streamFileChunks(file);
    } else if (typeof s3Key === "string" && s3Key.trim()) {
      const trimmedKey = s3Key.trim();
      sourceKind = extname(trimmedKey).toLowerCase() === ".dump" ? "dump" : "sql";
      sourceStream = await getS3ObjectStream(trimmedKey);
    } else {
      return NextResponse.json(
        { error: "Upload a .sql/.dump file or provide an S3 object key." },
        { status: 400 },
      );
    }
  }

  try {
    if (!sourceStream) {
      return NextResponse.json({ error: "No import source found." }, { status: 400 });
    }
    if (sourceKind === "dump") {
      await runCommandWithInput("pg_restore", [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        connectionString,
      ], sourceStream);
    } else {
      await runCommandWithInput("psql", [
        "--set",
        "ON_ERROR_STOP=1",
        "--dbname",
        connectionString,
      ], sourceStream);
    }

    return NextResponse.json({ message: "Dump import completed." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dump import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function resolveConnectionString(): string | undefined {
  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const port = process.env.PGPORT ?? "5432";

  if (host && database && user && password) {
    const encodedPassword = encodeURIComponent(password);
    return `postgres://${user}:${encodedPassword}@${host}:${port}/${database}`;
  }

  return process.env.DATABASE_URL;
}

async function getS3ObjectStream(key: string): Promise<AsyncIterable<Uint8Array>> {
  if (!s3Client || !s3Bucket) {
    throw new Error("S3 is not configured.");
  }
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    }),
  );
  if (!response.Body) {
    throw new Error("S3 object is empty.");
  }
  return response.Body as AsyncIterable<Uint8Array>;
}

function runCommandWithInput(
  command: string,
  args: string[],
  input: AsyncIterable<Uint8Array>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`${command} is not installed in this runtime.`));
        return;
      }
      reject(error);
    });

    const feedInput = async () => {
      if (!child.stdin) {
        throw new Error(`${command} stdin is not available.`);
      }
      for await (const chunk of input) {
        if (!child.stdin.write(chunk)) {
          await once(child.stdin, "drain");
        }
      }
      child.stdin.end();
    };

    void feedInput().catch((error) => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const details = stderr.trim();
      reject(new Error(details || `${command} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function* streamFileChunks(file: File): AsyncIterable<Uint8Array> {
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
