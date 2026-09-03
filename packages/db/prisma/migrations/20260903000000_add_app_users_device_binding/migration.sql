-- CreateEnum
CREATE TYPE "BindingStatus" AS ENUM ('active', 'unbound');

-- CreateEnum
CREATE TYPE "BindingCodeStatus" AS ENUM ('active', 'used', 'disabled');

-- DropForeignKey
ALTER TABLE "device_commands" DROP CONSTRAINT "device_commands_created_by_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- AlterTable
ALTER TABLE "device_commands" ADD COLUMN     "app_user_id" VARCHAR(64),
ALTER COLUMN "created_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_type" VARCHAR(16) NOT NULL DEFAULT 'user',
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "app_users" (
    "id" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nickname" VARCHAR(128) NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_refresh_tokens" (
    "id" VARCHAR(64) NOT NULL,
    "app_user_id" VARCHAR(64) NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" VARCHAR(64) NOT NULL,
    "app_user_id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "alias" VARCHAR(128),
    "status" "BindingStatus" NOT NULL DEFAULT 'active',
    "bound_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unbound_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_binding_codes" (
    "id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "status" "BindingCodeStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "used_by" VARCHAR(64),
    "created_by" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_binding_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_phone_key" ON "app_users"("phone");

-- CreateIndex
CREATE INDEX "app_users_status_idx" ON "app_users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "app_refresh_tokens_token_hash_key" ON "app_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "app_refresh_tokens_app_user_id_revoked_at_idx" ON "app_refresh_tokens"("app_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "app_refresh_tokens_expires_at_idx" ON "app_refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "user_devices_app_user_id_status_idx" ON "user_devices"("app_user_id", "status");

-- CreateIndex
CREATE INDEX "user_devices_device_id_status_idx" ON "user_devices"("device_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_app_user_id_device_id_key" ON "user_devices"("app_user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_binding_codes_code_hash_key" ON "device_binding_codes"("code_hash");

-- CreateIndex
CREATE INDEX "device_binding_codes_device_id_status_expires_at_idx" ON "device_binding_codes"("device_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "device_binding_codes_expires_at_idx" ON "device_binding_codes"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_actor_type_created_at_idx" ON "audit_logs"("org_id", "actor_type", "created_at");

-- AddForeignKey
ALTER TABLE "app_refresh_tokens" ADD CONSTRAINT "app_refresh_tokens_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_binding_codes" ADD CONSTRAINT "device_binding_codes_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_binding_codes" ADD CONSTRAINT "device_binding_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
