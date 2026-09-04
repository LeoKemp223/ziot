-- DropIndex
DROP INDEX "firmwares_product_id_version_key";

-- AlterTable
ALTER TABLE "firmwares" ADD COLUMN     "base_version" VARCHAR(64),
ADD COLUMN     "patch_format" VARCHAR(64),
ADD COLUMN     "target_sha256" VARCHAR(128);

-- CreateIndex
CREATE UNIQUE INDEX "firmwares_product_id_version_base_version_key" ON "firmwares"("product_id", "version", "base_version");
