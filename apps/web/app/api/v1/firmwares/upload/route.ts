import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { createFirmware } from "@/features/ota/ota-service";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

const maxUploadBytes = 50 * 1024 * 1024;
const uploadRoot = path.join(process.cwd(), "public", "uploads", "firmwares");

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("permission denied"), { code: 403001 });
  }
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { code: 400001 });
}

function safePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return sanitized || fallback;
}

function safeFileName(value: string) {
  const baseName = path.basename(value || "firmware.bin");
  return safePathSegment(baseName, "firmware.bin");
}

function requestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    return `${forwardedProto ?? request.nextUrl.protocol.replace(":", "")}://${host}`;
  }

  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  let savedPath: string | null = null;

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:write");

    const form = await request.formData();
    const productId = String(form.get("product_id") ?? "");
    const version = String(form.get("version") ?? "");
    const releaseNoteValue = form.get("release_note");
    const fileValue = form.get("file");

    if (!(fileValue instanceof File)) {
      badRequest("firmware file is required");
    }

    if (fileValue.size <= 0) {
      badRequest("firmware file is required");
    }

    if (fileValue.size > maxUploadBytes) {
      badRequest("firmware file must be less than 50MB");
    }

    const bytes = Buffer.from(await fileValue.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const productDir = safePathSegment(productId, "unknown-product");
    const storedName = `${randomUUID()}-${safeFileName(fileValue.name)}`;
    const relativePath = `/uploads/firmwares/${productDir}/${storedName}`;
    const targetDir = path.join(uploadRoot, productDir);
    savedPath = path.join(targetDir, storedName);

    await mkdir(targetDir, { recursive: true });
    await writeFile(savedPath, bytes, { flag: "wx" });

    const firmware = await createFirmware(prisma, {
      orgId: user.current_org_id,
      createdBy: user.id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId,
      version,
      fileUrl: `${requestOrigin(request)}${relativePath}`,
      fileSize: fileValue.size,
      sha256,
      ...(typeof releaseNoteValue === "string" ? { releaseNote: releaseNoteValue } : {})
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "firmware.upload",
      resourceType: "firmware",
      resourceId: firmware.id,
      request,
      detail: {
        product_id: firmware.product_id,
        version: firmware.version,
        file_url: firmware.file_url,
        file_size: firmware.file_size,
        sha256: firmware.sha256
      }
    });

    savedPath = null;

    return NextResponse.json(apiOk(firmware, requestId), { status: 201 });
  } catch (error) {
    if (savedPath) {
      await rm(savedPath, { force: true }).catch(() => undefined);
    }

    return apiErrorResponse(error, requestId);
  }
}
