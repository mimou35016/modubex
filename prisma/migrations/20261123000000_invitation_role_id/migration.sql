-- Invitations now persist the exact Role row selected at creation time. The
-- legacy `role` key column is kept for backwards compatibility and auditing.
ALTER TABLE "invitation" ADD COLUMN     "roleId" TEXT,
ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT '';

-- Backfill from the seeded role table by legacy key. The UPDATE only touches
-- rows that still have no roleId, so it is safe to rerun during a backfill.
UPDATE "invitation" i
SET "roleId" = (
    SELECT r."id"
    FROM "role" r
    WHERE r."key" = lower(i."role") AND r."workspaceId" = ''
    LIMIT 1
)
WHERE i."roleId" IS NULL;

-- Any invitation with an unmapped legacy key falls back to the seeded Member
-- role (which the M2 migration always creates).
UPDATE "invitation"
SET "roleId" = (
    SELECT r."id"
    FROM "role" r
    WHERE r."key" = 'member' AND r."workspaceId" = ''
    LIMIT 1
)
WHERE "roleId" IS NULL;

ALTER TABLE "invitation" ALTER COLUMN "roleId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "invitation_workspaceId_idx" ON "invitation"("workspaceId");

-- AddForeignKey
-- Pending invitations are removed with their role: a deleted role can no
-- longer be granted, and role deletion must not be blocked by stale tokens.
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
