-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "metaLastSyncError" TEXT,
ADD COLUMN     "metaLastSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MetaCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "dailyBudgetCents" INTEGER,
    "lifetimeBudgetCents" INTEGER,
    "createdTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaignDay" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spendCents" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "reach" INTEGER NOT NULL,
    "metaPurchases" INTEGER NOT NULL,
    "metaPurchaseValueCents" INTEGER NOT NULL,

    CONSTRAINT "MetaCampaignDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaCampaignDay_date_idx" ON "MetaCampaignDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignDay_campaignId_date_key" ON "MetaCampaignDay"("campaignId", "date");

-- AddForeignKey
ALTER TABLE "MetaCampaignDay" ADD CONSTRAINT "MetaCampaignDay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MetaCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

