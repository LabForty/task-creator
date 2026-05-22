import { NextResponse } from "next/server";
import {
  getValidSession,
  isJiraError,
  uploadAttachmentBinary,
  readDraftAttachmentMaxBytes,
} from "@/lib/jira";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const cloudId = form.get("cloudId");
  const issueKey = form.get("issueKey");
  const file = form.get("file");

  if (typeof cloudId !== "string" || !cloudId) {
    return NextResponse.json({ error: "cloudId is required" }, { status: 400 });
  }
  if (typeof issueKey !== "string" || !issueKey) {
    return NextResponse.json({ error: "issueKey is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const max = readDraftAttachmentMaxBytes();
  if (file.size > max) {
    return NextResponse.json(
      { error: `file too large: max ${max} bytes`, max },
      { status: 413 },
    );
  }

  try {
    const session = await getValidSession();
    const data = new Uint8Array(await file.arrayBuffer());
    await uploadAttachmentBinary(
      session.accessToken,
      cloudId,
      issueKey,
      file.name,
      data,
      file.type || "application/octet-stream",
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isJiraError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
