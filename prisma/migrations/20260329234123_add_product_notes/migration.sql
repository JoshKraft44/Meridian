-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('SHOPIFY', 'ETSY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('SHOPIFY_PROCESSING', 'SHOPIFY_APP', 'SHOPIFY_OTHER', 'PAYMENT_PROCESSING');

-- CreateEnum
CREATE TYPE "ExpenseCategoryType" AS ENUM ('SOURCING', 'PACKAGING', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('MONTHLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformOrderId" TEXT NOT NULL,
    "orderName" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "grossRevenueCents" INTEGER NOT NULL,
    "subtotalPriceCents" INTEGER,
    "totalDiscountsCents" INTEGER,
    "shippingChargedCents" INTEGER NOT NULL,
    "shippingCostCents" INTEGER,
    "shippingCostOverrideCents" INTEGER,
    "taxesCents" INTEGER NOT NULL,
    "cogsCents" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "shippingName" TEXT,
    "shippingAddress1" TEXT,
    "shippingAddress2" TEXT,
    "shippingCity" TEXT,
    "shippingProvince" TEXT,
    "shippingProvinceCode" TEXT,
    "shippingZip" TEXT,
    "shippingCountry" TEXT,
    "shippingCountryCode" TEXT,
    "fulfillmentStatus" TEXT,
    "note" TEXT,
    "tags" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "discountCodes" JSONB,
    "paymentGateway" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "platformItemId" TEXT NOT NULL,
    "platformProductId" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "quantity" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "sku" TEXT,
    "requiresShipping" BOOLEAN NOT NULL DEFAULT true,
    "grams" INTEGER,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "FeeType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "platformRefundId" TEXT NOT NULL,
    "refundDate" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformPayoutId" TEXT NOT NULL,
    "payoutDate" TIMESTAMP(3) NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "chargesFeesCents" INTEGER NOT NULL,
    "adjustmentsFeesCents" INTEGER NOT NULL,
    "refundsFeesCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEvent" (
    "id" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseCategoryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "frequency" "BillingFrequency" NOT NULL,
    "platform" "Platform",
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vendor" TEXT,
    "productType" TEXT,
    "status" TEXT,
    "tags" TEXT,
    "description" TEXT,
    "sku" TEXT,
    "priceCents" INTEGER,
    "weightGrams" INTEGER,
    "lengthCm" DOUBLE PRECISION,
    "widthCm" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "linkedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "filename" TEXT,
    "alt" TEXT,
    "position" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductNote" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "ordersUpserted" INTEGER NOT NULL DEFAULT 0,
    "payoutsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL DEFAULT '#c0392b',
    "excludeTaxesFromGross" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

-- CreateIndex
CREATE INDEX "Order_platform_idx" ON "Order"("platform");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_platform_platformOrderId_key" ON "Order"("platform", "platformOrderId");

-- CreateIndex
CREATE INDEX "LineItem_orderId_idx" ON "LineItem"("orderId");

-- CreateIndex
CREATE INDEX "FeeLine_orderId_idx" ON "FeeLine"("orderId");

-- CreateIndex
CREATE INDEX "FeeLine_type_idx" ON "FeeLine"("type");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Refund_platformRefundId_idx" ON "Refund"("platformRefundId");

-- CreateIndex
CREATE INDEX "Payout_payoutDate_idx" ON "Payout"("payoutDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_platform_platformPayoutId_key" ON "Payout"("platform", "platformPayoutId");

-- CreateIndex
CREATE INDEX "ExpenseEvent_eventDate_idx" ON "ExpenseEvent"("eventDate");

-- CreateIndex
CREATE INDEX "ExpenseEvent_category_idx" ON "ExpenseEvent"("category");

-- CreateIndex
CREATE INDEX "Subscription_startDate_idx" ON "Subscription"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Product_linkedProductId_key" ON "Product"("linkedProductId");

-- CreateIndex
CREATE INDEX "Product_platform_idx" ON "Product"("platform");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_platform_platformProductId_key" ON "Product"("platform", "platformProductId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_filename_idx" ON "ProductImage"("filename");

-- CreateIndex
CREATE INDEX "ProductNote_productId_idx" ON "ProductNote"("productId");

-- CreateIndex
CREATE INDEX "SyncRun_platform_idx" ON "SyncRun"("platform");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_shop_key" ON "ShopifyConnection"("shop");

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeLine" ADD CONSTRAINT "FeeLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_linkedProductId_fkey" FOREIGN KEY ("linkedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductNote" ADD CONSTRAINT "ProductNote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
