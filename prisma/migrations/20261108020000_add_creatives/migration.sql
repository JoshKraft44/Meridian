-- CreateEnum
CREATE TYPE "CreativeKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "kind" "CreativeKind" NOT NULL,
    "url" TEXT NOT NULL,
    "shopifyFileId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "tags" TEXT[],
    "notes" TEXT,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Creative_shopifyFileId_key" ON "Creative"("shopifyFileId");

-- CreateIndex
CREATE INDEX "Creative_createdAt_idx" ON "Creative"("createdAt");

-- CreateIndex
CREATE INDEX "Creative_productId_idx" ON "Creative"("productId");

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

