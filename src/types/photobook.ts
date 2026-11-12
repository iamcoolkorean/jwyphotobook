export interface PhotoItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  aspectRatioLabel?: string; // e.g. "4:3", "16:9", "3:4", "1:1"
  year?: string;
  location?: string;
  filmStockOrCamera?: string;
  notes?: string;
  fileSize?: string;
  isDriveAsset?: boolean;
  driveFileId?: string;
}

export interface PhotoBook {
  id: string;
  title: string;
  subtitle: string;
  edition: string;
  year: string;
  curatorNote: string;
  coverImage: PhotoItem;
  photos: PhotoItem[];
  themeColor?: string;
  category?: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    rotation?: number;
    location?: {
      latitude: number;
      longitude: number;
      altitude: number;
    };
    time?: string;
    cameraMake?: string;
    cameraModel?: string;
    exposureTime?: number;
    aperture?: number;
    flashUsed?: boolean;
    focalLength?: number;
    isoSpeed?: number;
  };
}

export type AppViewMode = 'intro' | 'list' | 'detail' | 'drive';
