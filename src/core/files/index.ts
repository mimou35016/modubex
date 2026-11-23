export {
  ALLOWED_IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  MAX_LOGO_BYTES,
  deleteFile,
  getFileAsset,
  getCurrentAvatar,
  getSiteLogo,
  uploadFile,
  uploadFileSchema,
} from "./service";
export type { FileAssetView, FilePurpose } from "./service";
export {
  AVATAR_READ_PERMISSION,
  canManageOwnAvatar,
  canReadAvatar,
  canReadFileAsset,
} from "./authorization";
