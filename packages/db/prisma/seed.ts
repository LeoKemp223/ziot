import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://ziot:ziot@localhost:5432/ziot"
});

const prisma = new PrismaClient({ adapter });

const permissions = [
  ["perm_user_read", "user:read", "用户查看", "identity"],
  ["perm_user_write", "user:write", "用户写入", "identity"],
  ["perm_invite_read", "invite:read", "邀请码查看", "identity"],
  ["perm_invite_write", "invite:write", "邀请码写入", "identity"],
  ["perm_product_read", "product:read", "产品查看", "product"],
  ["perm_product_write", "product:write", "产品写入", "product"],
  ["perm_device_read", "device:read", "设备查看", "device"],
  ["perm_device_write", "device:write", "设备写入", "device"],
  ["perm_device_control", "device:control", "设备控制", "control"],
  ["perm_ota_read", "ota:read", "OTA 查看", "ota"],
  ["perm_ota_write", "ota:write", "OTA 写入", "ota"],
  ["perm_ota_execute", "ota:execute", "OTA 执行", "ota"],
  ["perm_log_read", "log:read", "日志查看", "log"],
  ["perm_audit_read", "audit:read", "审计查看", "audit"]
] as const;

const memberPermissionCodes = new Set([
  "product:read",
  "product:write",
  "device:read",
  "device:write",
  "device:control",
  "ota:read",
  "ota:write",
  "ota:execute",
  "log:read"
]);

async function main() {
  const password_hash = await bcrypt.hash("Admin123456", 10);
  const operator_password_hash = await bcrypt.hash("Operator123456", 10);

  await prisma.organization.upsert({
    where: { id: "org_default" },
    update: {},
    create: {
      id: "org_default",
      name: "默认组织"
    }
  });

  await prisma.user.upsert({
    where: { account: "13800000001" },
    update: {},
    create: {
      id: "usr_admin",
      account: "13800000001",
      password_hash,
      display_name: "平台管理员"
    }
  });

  await prisma.user.upsert({
    where: { account: "13800000002" },
    update: {
      display_name: "普通操作员"
    },
    create: {
      id: "usr_operator",
      account: "13800000002",
      password_hash: operator_password_hash,
      display_name: "普通操作员"
    }
  });

  for (const [id, code, name, module] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { id, code, name, module }
    });
  }

  const adminRole = await prisma.role.upsert({
    where: { org_id_code: { org_id: "org_default", code: "org_admin" } },
    update: {},
    create: {
      id: "role_org_admin",
      org_id: "org_default",
      code: "org_admin",
      name: "组织管理员"
    }
  });

  const memberRole = await prisma.role.upsert({
    where: { org_id_code: { org_id: "org_default", code: "org_member" } },
    update: {
      name: "普通用户"
    },
    create: {
      id: "role_org_member",
      org_id: "org_default",
      code: "org_member",
      name: "普通用户",
      description: "可查看产品、设备、OTA 和日志的普通成员"
    }
  });

  await prisma.userOrgRole.upsert({
    where: {
      user_id_org_id_role_id: {
        user_id: "usr_admin",
        org_id: "org_default",
        role_id: adminRole.id
      }
    },
    update: {},
    create: {
      id: "uor_admin_default",
      user_id: "usr_admin",
      org_id: "org_default",
      role_id: adminRole.id
    }
  });

  await prisma.userOrgRole.upsert({
    where: {
      user_id_org_id_role_id: {
        user_id: "usr_operator",
        org_id: "org_default",
        role_id: memberRole.id
      }
    },
    update: {},
    create: {
      id: "uor_operator_default",
      user_id: "usr_operator",
      org_id: "org_default",
      role_id: memberRole.id
    }
  });

  for (const [permission_id, code] of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        role_id_permission_id: {
          role_id: adminRole.id,
          permission_id
        }
      },
      update: {},
      create: {
        role_id: adminRole.id,
        permission_id
      }
    });

    if (memberPermissionCodes.has(code)) {
      await prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: memberRole.id,
            permission_id
          }
        },
        update: {},
        create: {
          role_id: memberRole.id,
          permission_id
        }
      });
    }
  }

  await prisma.product.upsert({
    where: { product_key: "pk_demo" },
    update: {
      created_by: "usr_admin"
    },
    create: {
      id: "prd_demo",
      org_id: "org_default",
      created_by: "usr_admin",
      product_key: "pk_demo",
      name: "演示产品",
      protocols: ["mqtt"],
      auth_type: "device_secret",
      data_format: "json",
      thing_model: {
        version: "1.0",
        properties: [],
        events: [],
        services: []
      }
    }
  });

  for (const [id, device_key, name] of [
    ["dev_mqtt_demo", "dk_mqtt_demo", "演示设备"]
  ] as const) {
    await prisma.device.upsert({
      where: {
        product_id_device_key: {
          product_id: "prd_demo",
          device_key
        }
      },
      update: {
        created_by: "usr_admin",
        device_secret_hash: await bcrypt.hash("DeviceSecret123", 10)
      },
      create: {
        id,
        org_id: "org_default",
        created_by: "usr_admin",
        product_id: "prd_demo",
        device_key,
        device_secret_hash: await bcrypt.hash("DeviceSecret123", 10),
        name,
        tags: {}
      }
    });

    await prisma.deviceShadow.upsert({
      where: { device_id: id },
      update: {},
      create: {
        device_id: id,
        org_id: "org_default",
        reported: {},
        desired: {}
      }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
