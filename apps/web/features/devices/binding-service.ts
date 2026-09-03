import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { clampPage, clampPageSize, buildPagination } from "@/lib/pagination";

type Db = {
  [key: string]: any;
  $transaction?: <T>(callback: (tx: Db) => Promise<T>) => Promise<T>;
};

type AccessScope = {
  userId?: string;
  canAccessAll?: boolean;
};

export type BindingError = Error & {
  code: 400001 | 401001 | 403001 | 404001 | 409001;
};

const BINDING_CODE_PREFIX = "BD";
// 永久绑定码:出厂印刷在产品上、永不过期,熵必须足以抵抗长期暴力尝试(80bit)
const BINDING_CODE_RANDOM_LENGTH = 16;
// 与邀请码同一字母表:去掉易混淆的 0/O/1/I,32 个字符正好可用单字节无偏取模
const BINDING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function serviceError(code: BindingError["code"], message: string): BindingError {
  return Object.assign(new Error(message), { code });
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function ownerFilter(input: AccessScope) {
  return input.canAccessAll || !input.userId ? {} : { created_by: input.userId };
}

function bindingCode(): string {
  const bytes = randomBytes(BINDING_CODE_RANDOM_LENGTH);
  let code = BINDING_CODE_PREFIX;

  for (const byte of bytes) {
    code += BINDING_CODE_ALPHABET[byte % 32];
  }

  return code;
}

function normalizeBindingCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function assertBindingCodeFormat(code: string) {
  if (!new RegExp(`^${BINDING_CODE_PREFIX}[2-9A-HJ-NP-Z]{${BINDING_CODE_RANDOM_LENGTH}}$`).test(code)) {
    throw serviceError(400001, "绑定码格式不正确");
  }
}

// QR 内容:URL fragment 携带永久绑定码,不进入任何中间服务器访问日志
function bindingQrContent(code: string): string {
  const baseUrl = process.env.APP_BIND_QR_BASE_URL ?? "http://localhost:3000";

  return `${baseUrl.replace(/\/+$/, "")}/b/#${code}`;
}

function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;
}

async function findDeviceForScope(
  db: Db,
  input: AccessScope & { orgId: string; deviceId: string }
) {
  const device = await db.device.findFirst({
    where: {
      id: input.deviceId,
      org_id: input.orgId,
      deleted_at: null,
      ...ownerFilter(input)
    },
    include: { product: true }
  });

  if (!device) {
    throw serviceError(404001, "设备不存在");
  }

  return device;
}

async function renderQr(code: string) {
  const qrContent = bindingQrContent(code);

  return {
    qr_content: qrContent,
    qr_data_url: await QRCode.toDataURL(qrContent, {
      width: 240,
      margin: 2
    })
  };
}

function mapBoundDevice(binding: any) {
  const device = binding.device;

  return {
    device_id: device.id,
    alias: binding.alias,
    name: device.name,
    product_id: device.product_id,
    product_name: device.product?.name ?? "",
    product_key: device.product?.product_key ?? "",
    device_key: device.device_key,
    status: device.status,
    online_status: device.online_status,
    firmware_version: device.firmware_version,
    bound_at: binding.bound_at.toISOString(),
    shadow_reported: device.shadow?.reported ?? {},
    shadow_updated_at: device.shadow?.updated_at?.toISOString() ?? null
  };
}

/**
 * 查看设备的永久绑定码(扫码绑定用)。
 * 永久码明文存储在 devices 上(与邀请码同级的"印在实物上的持有凭证"),
 * 可反复查看/补打标签;首次查看时懒生成。绑定码永不过期。
 */
export async function getDeviceBindingCode(
  db: Db,
  input: AccessScope & {
    orgId: string;
    deviceId: string;
  }
) {
  const device = await findDeviceForScope(db, input);

  if (device.binding_code) {
    return {
      device_id: device.id,
      code: device.binding_code,
      ...(await renderQr(device.binding_code)),
      generated_at:
        device.binding_code_generated_at?.toISOString() ?? null
    };
  }

  const code = bindingCode();
  const generatedAt = new Date();
  await db.device.update({
    where: { id: device.id },
    data: {
      binding_code: code,
      binding_code_generated_at: generatedAt
    }
  });

  return {
    device_id: device.id,
    code,
    ...(await renderQr(code)),
    generated_at: generatedAt.toISOString()
  };
}

/**
 * 轮换永久绑定码:旧码立即失效(已印刷的旧标签作废),返回新码。
 * 用于码泄露的场景;正常补打标签用 getDeviceBindingCode 即可。
 */
export async function rotateDeviceBindingCode(
  db: Db,
  input: AccessScope & {
    orgId: string;
    deviceId: string;
  }
) {
  const device = await findDeviceForScope(db, input);
  const code = bindingCode();
  const generatedAt = new Date();
  await db.device.update({
    where: { id: device.id },
    data: {
      binding_code: code,
      binding_code_generated_at: generatedAt
    }
  });

  return {
    device_id: device.id,
    code,
    ...(await renderQr(code)),
    generated_at: generatedAt.toISOString()
  };
}

/**
 * App 扫码绑定:按设备永久码查找并建立绑定。
 * 永久码可被多个 App 用户重复使用(家庭共享,一人一码全家可扫)。
 */
export async function bindDeviceByCode(
  db: Db,
  input: { appUserId: string; code: string }
) {
  const code = normalizeBindingCode(input.code);
  assertBindingCodeFormat(code);

  const device = await db.device.findUnique({
    where: { binding_code: code },
    include: { product: true, shadow: true }
  });

  if (!device || device.deleted_at) {
    throw serviceError(400001, "绑定码无效");
  }

  if (device.status !== "active") {
    throw serviceError(403001, "设备已被禁用");
  }

  const run = async (tx: Db) =>
    tx.userDevice.upsert({
      where: {
        app_user_id_device_id: {
          app_user_id: input.appUserId,
          device_id: device.id
        }
      },
      update: { status: "active", unbound_at: null },
      create: {
        id: id("bnd"),
        app_user_id: input.appUserId,
        device_id: device.id
      },
      include: {
        device: { include: { product: true, shadow: true } }
      }
    });

  const binding = db.$transaction
    ? await db.$transaction(run)
    : await run(db);

  return {
    ...mapBoundDevice(binding),
    org_id: device.org_id
  };
}

export async function listDeviceBindings(
  db: Db,
  input: AccessScope & {
    orgId: string;
    deviceId: string;
    page?: number;
    pageSize?: number;
  }
) {
  await findDeviceForScope(db, input);
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const where = { device_id: input.deviceId, status: "active" as const };
  const [total, bindings] = await Promise.all([
    db.userDevice.count({ where }),
    db.userDevice.findMany({
      where,
      orderBy: { bound_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { app_user: true }
    })
  ]);

  return {
    items: bindings.map((binding: any) => ({
      id: binding.id,
      device_id: binding.device_id,
      alias: binding.alias,
      app_user_id: binding.app_user_id,
      nickname: binding.app_user?.nickname ?? "",
      phone: maskPhone(binding.app_user?.phone ?? ""),
      bound_at: binding.bound_at.toISOString()
    })),
    pagination: buildPagination(page, pageSize, total)
  };
}

export async function listAppDevices(db: Db, input: { appUserId: string }) {
  const bindings = await db.userDevice.findMany({
    where: { app_user_id: input.appUserId, status: "active" },
    orderBy: { bound_at: "desc" },
    include: {
      device: {
        include: { product: true, shadow: true }
      }
    }
  });

  return {
    items: bindings.map(mapBoundDevice)
  };
}

export async function getActiveBinding(
  db: Db,
  input: { appUserId: string; deviceId: string }
) {
  const binding = await db.userDevice.findFirst({
    where: {
      app_user_id: input.appUserId,
      device_id: input.deviceId,
      status: "active"
    },
    include: {
      device: {
        include: { product: true, shadow: true }
      }
    }
  });

  if (!binding) {
    throw serviceError(403001, "尚未绑定该设备");
  }

  if (binding.device.deleted_at) {
    throw serviceError(404001, "设备不存在");
  }

  return {
    binding,
    device: binding.device
  };
}

export async function renameAppDeviceAlias(
  db: Db,
  input: { appUserId: string; deviceId: string; alias?: string }
) {
  await getActiveBinding(db, input);
  const alias = input.alias === undefined ? undefined : input.alias.trim();

  if (alias !== undefined && alias.length > 128) {
    throw serviceError(400001, "别名长度必须为 0-128 位");
  }

  const binding = await db.userDevice.update({
    where: {
      app_user_id_device_id: {
        app_user_id: input.appUserId,
        device_id: input.deviceId
      }
    },
    data: alias === undefined ? {} : { alias: alias || null }
  });

  return {
    device_id: binding.device_id,
    alias: binding.alias,
    bound_at: binding.bound_at.toISOString()
  };
}

export async function unbindAppDevice(
  db: Db,
  input: { appUserId: string; deviceId: string }
) {
  const { device } = await getActiveBinding(db, input);
  const binding = await db.userDevice.update({
    where: {
      app_user_id_device_id: {
        app_user_id: input.appUserId,
        device_id: input.deviceId
      }
    },
    data: { status: "unbound", unbound_at: new Date() }
  });

  return {
    device_id: binding.device_id,
    org_id: device.org_id,
    unbound_at: (binding.unbound_at ?? new Date()).toISOString()
  };
}
