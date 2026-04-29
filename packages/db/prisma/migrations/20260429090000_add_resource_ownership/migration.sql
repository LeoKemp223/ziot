ALTER TABLE "products" ADD COLUMN "created_by" VARCHAR(64);
ALTER TABLE "devices" ADD COLUMN "created_by" VARCHAR(64);
ALTER TABLE "device_groups" ADD COLUMN "created_by" VARCHAR(64);

UPDATE "products"
SET "created_by" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "created_by" IS NULL;

UPDATE "devices"
SET "created_by" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "created_by" IS NULL;

UPDATE "device_groups"
SET "created_by" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "created_by" IS NULL;

ALTER TABLE "products" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "devices" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "device_groups" ALTER COLUMN "created_by" SET NOT NULL;

ALTER TABLE "products"
  ADD CONSTRAINT "products_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "devices"
  ADD CONSTRAINT "devices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_groups"
  ADD CONSTRAINT "device_groups_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "products_org_id_created_by_deleted_at_idx"
  ON "products"("org_id", "created_by", "deleted_at");

CREATE INDEX "devices_org_id_created_by_deleted_at_idx"
  ON "devices"("org_id", "created_by", "deleted_at");

CREATE INDEX "device_groups_org_id_created_by_deleted_at_idx"
  ON "device_groups"("org_id", "created_by", "deleted_at");
