-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "binding_code" VARCHAR(32),
ADD COLUMN     "binding_code_generated_at" TIMESTAMPTZ;

-- CreateIndex
CREATE UNIQUE INDEX "devices_binding_code_key" ON "devices"("binding_code");

-- DropTable
DROP TABLE "device_binding_codes";

-- DropEnum
DROP TYPE "BindingCodeStatus";
