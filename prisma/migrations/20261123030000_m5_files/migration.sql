-- CreateTable
CREATE TABLE "fileAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "ownerId" TEXT,
    "purpose" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fileAsset_storageKey_key" ON "fileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "fileAsset_ownerId_purpose_idx" ON "fileAsset"("ownerId", "purpose");

-- CreateIndex
CREATE INDEX "fileAsset_workspaceId_purpose_idx" ON "fileAsset"("workspaceId", "purpose");

-- AddForeignKey
ALTER TABLE "fileAsset" ADD CONSTRAINT "fileAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
