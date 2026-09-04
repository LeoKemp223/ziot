import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ziot/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { apiOk } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/identity/session";
import { createRequestId } from "@/lib/request-id";
import { createDeltaFirmware } from "@/features/ota/ota-service";
import { runPatchTool } from "@/features/ota/firmware-patch";
import { safeWriteAuditLog } from "@/features/logs/audit/audit-service";
import { requestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const maxUploadBytes = 5 * 1024 * 1024;
const uploadRoot = path.join(process.cwd(), "public", "uploads", "firmwares");

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

function safePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return sanitized || fallback;
}

function requireFirmwareFile(form: FormData, field: string, label: string) {
  const file = form.get(field);

  if (!(file instanceof File) || file.size <= 0) {
    badRequest(`必须上传${label}固件文件`);
  }

  if (file.size > maxUploadBytes) {
    badRequest(`${label}固件文件不能超过 5MB`);
  }

  // 差分只支持裸二进制镜像;hex 等带封装的格式与设备 flash 内容不对应
  if (!file.name.toLowerCase().endsWith(".bin")) {
    badRequest(`${label}固件文件必须为 .bin 裸二进制格式`);
  }

  return file;
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  // 补丁成品路径:落库失败时清理;临时目录:无论如何都清理
  let savedPath: string | null = null;
  let tmpDir: string | null = null;

  try {
    const user = await getCurrentUser(request);
    requirePermission(user.permissions, "ota:write");

    const form = await request.formData();
    const productId = String(form.get("product_id") ?? "");
    const version = String(form.get("version") ?? "");
    const baseVersion = String(form.get("base_version") ?? "");
    const releaseNoteValue = form.get("release_note");
    const baseFile = requireFirmwareFile(form, "file_base", "基线");
    const targetFile = requireFirmwareFile(form, "file_target", "目标");

    const baseBytes = Buffer.from(await baseFile.arrayBuffer());
    const targetBytes = Buffer.from(await targetFile.arrayBuffer());

    if (baseBytes.equals(targetBytes)) {
      badRequest("基线固件与目标固件内容相同，无法生成差分");
    }

    const targetSha256 = createHash("sha256").update(targetBytes).digest("hex");

    // 临时目录放 os.tmpdir():public/ 是无鉴权静态目录,基线/目标固件不能落那里
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "ziot-delta-"));
    const basePath = path.join(tmpDir, "base.bin");
    const targetPath = path.join(tmpDir, "target.bin");
    const patchPath = path.join(tmpDir, "patch.bin");

    await writeFile(basePath, baseBytes);
    await writeFile(targetPath, targetBytes);
    await runPatchTool({ basePath, targetPath, patchPath });

    const patchBytes = await readFile(patchPath);

    if (patchBytes.length === 0) {
      throw Object.assign(new Error("生成差分固件失败：补丁为空"), {
        code: 500001
      });
    }

    const patchSha256 = createHash("sha256").update(patchBytes).digest("hex");
    const productDir = safePathSegment(productId, "unknown-product");
    const storedName = `${randomUUID()}-delta-${safePathSegment(baseVersion, "base")}-${safePathSegment(version, "target")}.patch`;
    const relativePath = `/uploads/firmwares/${productDir}/${storedName}`;
    const targetDir = path.join(uploadRoot, productDir);
    savedPath = path.join(targetDir, storedName);

    await mkdir(targetDir, { recursive: true });
    await writeFile(savedPath, patchBytes, { flag: "wx" });

    const firmware = await createDeltaFirmware(prisma, {
      orgId: user.current_org_id,
      createdBy: user.id,
      userId: user.id,
      canAccessAll: canAccessAllResources(user.permissions),
      productId,
      version,
      baseVersion,
      fileUrl: `${requestOrigin(request)}${relativePath}`,
      fileSize: patchBytes.length,
      sha256: patchSha256,
      targetSha256,
      ...(typeof releaseNoteValue === "string"
        ? { releaseNote: releaseNoteValue }
        : {})
    });
    await safeWriteAuditLog(prisma, {
      user,
      action: "firmware.delta.create",
      resourceType: "firmware",
      resourceId: firmware.id,
      request,
      detail: {
        product_id: firmware.product_id,
        base_version: firmware.base_version,
        version: firmware.version,
        file_url: firmware.file_url,
        file_size: firmware.file_size,
        sha256: firmware.sha256,
        target_sha256: firmware.target_sha256,
        patch_format: firmware.patch_format
      }
    });

    savedPath = null;

    return NextResponse.json(apiOk(firmware, requestId), { status: 201 });
  } catch (error) {
    if (savedPath) {
      await rm(savedPath, { force: true }).catch(() => undefined);
    }

    return apiErrorResponse(error, requestId);
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
