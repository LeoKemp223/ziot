-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('active', 'disabled', 'expired');

-- CreateEnum
CREATE TYPE "OnlineStatus" AS ENUM ('online', 'offline', 'unknown');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('pending', 'sent', 'delivered', 'success', 'failed', 'timeout', 'cancelled');

-- CreateEnum
CREATE TYPE "FirmwareStatus" AS ENUM ('draft', 'released', 'deprecated');

-- CreateEnum
CREATE TYPE "OtaTaskStatus" AS ENUM ('created', 'scheduled', 'running', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "OtaRecordStatus" AS ENUM ('created', 'scheduled', 'notified', 'downloading', 'installing', 'success', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateTable
CREATE TABLE "organizations" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(64) NOT NULL,
    "account" VARCHAR(128) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(128) NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64),
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" VARCHAR(64) NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "module" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" VARCHAR(64) NOT NULL,
    "permission_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_org_roles" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "role_id" VARCHAR(64) NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_org_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" VARCHAR(64) NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "role_id" VARCHAR(64) NOT NULL,
    "max_uses" INTEGER NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'active',
    "created_by" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "product_key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "protocols" JSONB NOT NULL,
    "auth_type" VARCHAR(32) NOT NULL,
    "data_format" VARCHAR(32) NOT NULL,
    "thing_model" JSONB NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "product_id" VARCHAR(64) NOT NULL,
    "device_key" VARCHAR(128) NOT NULL,
    "device_secret_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "online_status" "OnlineStatus" NOT NULL DEFAULT 'unknown',
    "firmware_version" VARCHAR(64),
    "tags" JSONB NOT NULL,
    "last_online_at" TIMESTAMPTZ,
    "last_offline_at" TIMESTAMPTZ,
    "last_heartbeat_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_groups" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "product_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "device_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_group_members" (
    "group_id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_group_members_pkey" PRIMARY KEY ("group_id","device_id")
);

-- CreateTable
CREATE TABLE "device_shadows" (
    "device_id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "reported" JSONB NOT NULL,
    "desired" JSONB NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "device_shadows_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "device_commands" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "identifier" VARCHAR(128) NOT NULL,
    "params" JSONB NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'pending',
    "request_id" VARCHAR(128) NOT NULL,
    "result" JSONB,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "timeout_at" TIMESTAMPTZ NOT NULL,
    "sent_at" TIMESTAMPTZ,
    "replied_at" TIMESTAMPTZ,
    "created_by" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmwares" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "product_id" VARCHAR(64) NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "sha256" VARCHAR(128) NOT NULL,
    "release_note" TEXT,
    "status" "FirmwareStatus" NOT NULL DEFAULT 'draft',
    "created_by" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmwares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_tasks" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "product_id" VARCHAR(64) NOT NULL,
    "firmware_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "strategy" JSONB NOT NULL,
    "status" "OtaTaskStatus" NOT NULL DEFAULT 'created',
    "scheduled_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_by" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ota_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_records" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "task_id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "status" "OtaRecordStatus" NOT NULL DEFAULT 'created',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ota_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_logs" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "product_id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'info',
    "content" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(64) NOT NULL,
    "org_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "action" VARCHAR(128) NOT NULL,
    "resource_type" VARCHAR(64) NOT NULL,
    "resource_id" VARCHAR(64) NOT NULL,
    "ip" INET NOT NULL,
    "user_agent" TEXT,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_account_key" ON "users"("account");

-- CreateIndex
CREATE UNIQUE INDEX "roles_org_id_code_key" ON "roles"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_org_roles_user_id_status_idx" ON "user_org_roles"("user_id", "status");

-- CreateIndex
CREATE INDEX "user_org_roles_org_id_role_id_idx" ON "user_org_roles"("org_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_org_roles_user_id_org_id_role_id_key" ON "user_org_roles"("user_id", "org_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_code_hash_key" ON "invitations"("code_hash");

-- CreateIndex
CREATE INDEX "invitations_org_id_status_expires_at_idx" ON "invitations"("org_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_key_key" ON "products"("product_key");

-- CreateIndex
CREATE INDEX "products_org_id_deleted_at_idx" ON "products"("org_id", "deleted_at");

-- CreateIndex
CREATE INDEX "devices_org_id_product_id_idx" ON "devices"("org_id", "product_id");

-- CreateIndex
CREATE INDEX "devices_org_id_online_status_idx" ON "devices"("org_id", "online_status");

-- CreateIndex
CREATE INDEX "devices_org_id_product_id_deleted_at_idx" ON "devices"("org_id", "product_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_product_id_device_key_key" ON "devices"("product_id", "device_key");

-- CreateIndex
CREATE INDEX "device_groups_org_id_product_id_idx" ON "device_groups"("org_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_commands_request_id_key" ON "device_commands"("request_id");

-- CreateIndex
CREATE INDEX "device_commands_org_id_device_id_created_at_idx" ON "device_commands"("org_id", "device_id", "created_at");

-- CreateIndex
CREATE INDEX "device_commands_status_timeout_at_idx" ON "device_commands"("status", "timeout_at");

-- CreateIndex
CREATE INDEX "firmwares_org_id_product_id_status_idx" ON "firmwares"("org_id", "product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "firmwares_product_id_version_key" ON "firmwares"("product_id", "version");

-- CreateIndex
CREATE INDEX "ota_tasks_org_id_product_id_status_idx" ON "ota_tasks"("org_id", "product_id", "status");

-- CreateIndex
CREATE INDEX "ota_records_org_id_device_id_updated_at_idx" ON "ota_records"("org_id", "device_id", "updated_at");

-- CreateIndex
CREATE INDEX "ota_records_task_id_status_idx" ON "ota_records"("task_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ota_records_task_id_device_id_key" ON "ota_records"("task_id", "device_id");

-- CreateIndex
CREATE INDEX "device_logs_org_id_device_id_occurred_at_idx" ON "device_logs"("org_id", "device_id", "occurred_at");

-- CreateIndex
CREATE INDEX "device_logs_org_id_type_occurred_at_idx" ON "device_logs"("org_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_org_roles" ADD CONSTRAINT "user_org_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_org_roles" ADD CONSTRAINT "user_org_roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_org_roles" ADD CONSTRAINT "user_org_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_groups" ADD CONSTRAINT "device_groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_groups" ADD CONSTRAINT "device_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "device_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_shadows" ADD CONSTRAINT "device_shadows_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_shadows" ADD CONSTRAINT "device_shadows_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmwares" ADD CONSTRAINT "firmwares_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmwares" ADD CONSTRAINT "firmwares_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmwares" ADD CONSTRAINT "firmwares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_tasks" ADD CONSTRAINT "ota_tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_tasks" ADD CONSTRAINT "ota_tasks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_tasks" ADD CONSTRAINT "ota_tasks_firmware_id_fkey" FOREIGN KEY ("firmware_id") REFERENCES "firmwares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_tasks" ADD CONSTRAINT "ota_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_records" ADD CONSTRAINT "ota_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_records" ADD CONSTRAINT "ota_records_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "ota_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_records" ADD CONSTRAINT "ota_records_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
