ALTER TABLE "GeneratedImage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "GeneratedImage" SET "updatedAt" = "createdAt";

CREATE TABLE "StudioProductView" (
    "productGid" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioProductView_pkey" PRIMARY KEY ("productGid")
);
CREATE INDEX "StudioProductView_viewedAt_idx" ON "StudioProductView"("viewedAt");
