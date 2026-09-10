import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { createFirmware, findProductForScope } from "@/features/ota/ota-service";
import {
  firmwareObjectKey,
  minioStorageUrl,
  putFirmwareObject,
  removeFirmwareObject
} from "@/features/ota/firmware-storage";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";

export const runtime = "nodejs";

const maxUploadBytes = 5 * 1024 * 1024;

function canAccessAllResources(permissions: string[]) {
  return permissions.includes("user:read");
}

function requirePermission(permissions: string[], permission: string) {
  if (!permissions.includes(permission)) {
    throw Object.assign(new Error("没有操作权限"), { code: 403001 });
  }
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { code: 400001 });
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  let uploadedKey: string | null = null;

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:write");

    const form = await request.formData();
    const productId = String(form.get("product_id") ?? "");
    const version = String(form.get("version") ?? "");
    const releaseNoteValue = form.get("release_note");
    const fileValue = form.get("file");

    if (!(fileValue instanceof File)) {
      badRequest("必须上传固件文件");
    }

    if (fileValue.size <= 0) {
      badRequest("必须上传固件文件");
    }

    if (fileValue.size > maxUploadBytes) {
      badRequest("固件文件不能超过 5MB");
    }

    const bytes = Buffer.from(await fileValue.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    // 对象存私有桶(minio://),DB 存规范 URI,下载走预签名直链
    const product = await findProductForScope(prisma, {
      orgId: user.current_org_id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId
    });
    const objectKey = firmwareObjectKey(product.product_key, fileValue.name);
    uploadedKey = objectKey;
    await putFirmwareObject(objectKey, bytes, fileValue.type || "application/octet-stream");

    const firmware = await createFirmware(prisma, {
      orgId: user.current_org_id,
      createdBy: user.id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId,
      version,
      fileUrl: minioStorageUrl(objectKey),
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

    uploadedKey = null;

    return NextResponse.json(apiOk(firmware, requestId), { status: 201 });
  } catch (error) {
    // 登记失败(配额/版本重复等)时回收已上传对象,避免孤儿文件
    if (uploadedKey) {
      await removeFirmwareObject(uploadedKey).catch(() => undefined);
    }

    return apiErrorResponse(error, requestId);
  }
}
