-- CreateTable
CREATE TABLE "faqQuestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faqQuestion_workspaceId_published_position_idx" ON "faqQuestion"("workspaceId", "published", "position");
