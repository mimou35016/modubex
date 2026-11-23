-- CreateTable
CREATE TABLE "moduleInstall" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'available',
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "dataRetained" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "installedById" TEXT,
    "installedAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "uninstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moduleInstall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moduleInstall_moduleId_key" ON "moduleInstall"("moduleId");

-- CreateIndex
CREATE INDEX "moduleInstall_workspaceId_idx" ON "moduleInstall"("workspaceId");
