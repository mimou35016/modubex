import type { FileAssetView, FilePurpose } from "./service";

/** Permission that lets a signed-in user read any avatar in the workspace. */
export const AVATAR_READ_PERMISSION = "users.read";

/**
 * Pure avatar self-ownership check. An empty viewer id is never an owner, so
 * anonymous callers cannot match an unowned avatar by accident.
 */
export function canManageOwnAvatar(userId: string, ownerId: string | null): boolean {
  return userId.length > 0 && ownerId !== null && userId === ownerId;
}

/** Avatar readers are the owner or users holding the workspace read permission. */
export function canReadAvatar(input: {
  ownerId: string | null;
  viewerId: string;
  permissionKeys: readonly string[];
}): boolean {
  if (input.viewerId.length === 0) return false;
  return (
    canManageOwnAvatar(input.viewerId, input.ownerId) ||
    input.permissionKeys.includes(AVATAR_READ_PERMISSION)
  );
}

/**
 * Site branding is public; avatars are session-gated by ownership or the
 * `users.read` permission. Keeping this pure makes the serving route easy to
 * test without a database or request context.
 */
export function canReadFileAsset(
  asset: Pick<FileAssetView, "purpose" | "ownerId">,
  viewer: { id: string; permissionKeys: readonly string[] },
): boolean {
  const purpose: FilePurpose = asset.purpose;
  if (purpose === "site-logo") return true;
  return canReadAvatar({
    ownerId: asset.ownerId,
    viewerId: viewer.id,
    permissionKeys: viewer.permissionKeys,
  });
}
