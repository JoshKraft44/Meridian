-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "suggestedBy" TEXT;

-- CreateIndex
CREATE INDEX "SocialPost_groupId_idx" ON "SocialPost"("groupId");

