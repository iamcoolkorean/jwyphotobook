import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { PhotoBook, PhotoItem, GoogleDriveFile } from '../types/photobook.ts';
import {
  listDriveFolders,
  listDriveImagesInFolder,
  GoogleDriveFolder,
  fetchDriveImageBlobUrl,
  fetchDriveImageAsDataUrl,
  uploadImageToDrive,
  findDriveFoldersByName,
  listSubfolders,
} from '../services/googleDrive.ts';
import { getAccessToken, isAuthorizedAdmin } from '../services/firebaseAuth.ts';
import {
  testGitHubConnection,
  commitFileToGitHub,
  commitSquareImageToGitHub,
  renderSquareMatteBase64,
} from '../services/githubService.ts';
import {
  buildPhotobooksConfigPayload,
  parseGitHubRepoString,
  detectDefaultGitHubRepo,
} from '../utils/githubSync.ts';
import {
  formatArchivalCatalogDate,
  formatArchivalFileSize,
  convertImageToSquareMatteDataUrl,
} from '../utils/imageMatte.ts';
import { InformationConfig } from './InformationView.tsx';
import SpaceArchiveMatteImage from './SpaceArchiveMatteImage.tsx';
import ConfirmationDialog from './ConfirmationDialog.tsx';

interface AdminConsoleProps {
  user: User;
  books: PhotoBook[];
  onUpdateBooks: (books: PhotoBook[]) => void;
  mainBannerPhoto?: PhotoItem;
  catalogDescription: string;
  onUpdateCatalogDescription: (desc: string) => void;
  informationConfig: InformationConfig;
  onUpdateInformationConfig: (config: InformationConfig) => void;
  onClose: () => void;
}

export default function AdminConsole({
  user,
  books,
  onUpdateBooks,
  mainBannerPhoto,
  catalogDescription,
  onUpdateCatalogDescription,
  informationConfig,
  onUpdateInformationConfig,
  onClose,
}: AdminConsoleProps) {
  // Tabs: 'drive-folders' | 'captions' | 'info-editor' | 'github-sync'
  const [activeTab, setActiveTab] = useState<'drive-folders' | 'captions' | 'info-editor' | 'github-sync'>('drive-folders');

  // Google Drive state
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<GoogleDriveFolder | null>(null);
  const [subfolders, setSubfolders] = useState<GoogleDriveFolder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<GoogleDriveFolder[]>([]);
  const [rootPhotoFolder, setRootPhotoFolder] = useState<GoogleDriveFolder | null>(null);
  const [folderImages, setFolderImages] = useState<GoogleDriveFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [isImportingFolder, setIsImportingFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('사진');
  const [selectedDrivePhotoIds, setSelectedDrivePhotoIds] = useState<Set<string>>(new Set());
  const [targetBookForAppend, setTargetBookForAppend] = useState<string>(() => books[0]?.id || '');
  const [showGitHubAdvanced, setShowGitHubAdvanced] = useState<boolean>(false);

  // GitHub Settings state (reads only from secure storage entered directly in UI)
  const [githubToken, setGithubToken] = useState<string>(() => {
    try {
      return (
        sessionStorage.getItem('jwy_gh_pat') ||
        localStorage.getItem('jwy_gh_token') ||
        ''
      );
    } catch (_) {
      return '';
    }
  });
  const [githubRepo, setGithubRepo] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('jwy_gh_repo');
      if (
        saved &&
        saved !== 'iamcoolkorean/jwy-photobook' &&
        saved !== 'iamcoolkorean/jwyphotobook'
      ) {
        return saved;
      }
    } catch (_) {}
    return (
      (import.meta as any).env?.VITE_GITHUB_REPO ||
      detectDefaultGitHubRepo()
    );
  });
  const [githubBranch, setGithubBranch] = useState<string>(() => {
    return (
      (import.meta as any).env?.VITE_GITHUB_BRANCH ||
      localStorage.getItem('jwy_gh_branch') ||
      'main'
    );
  });

  const [githubStatus, setGithubStatus] = useState<string | null>(null);
  const [isTestingGitHub, setIsTestingGitHub] = useState(false);
  const [isSyncingGitHub, setIsSyncingGitHub] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  // Caption Editing state
  const [selectedBookForEdit, setSelectedBookForEdit] = useState<PhotoBook>(books[0] || null);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    action: () => {},
  });

  // Save GitHub config locally and to session
  const handleSaveGitHubConfig = () => {
    try {
      if (githubToken) {
        sessionStorage.setItem('jwy_gh_pat', githubToken);
        localStorage.setItem('jwy_gh_token', githubToken);
      } else {
        sessionStorage.removeItem('jwy_gh_pat');
        localStorage.removeItem('jwy_gh_token');
      }
      localStorage.setItem('jwy_gh_repo', githubRepo);
      localStorage.setItem('jwy_gh_branch', githubBranch);
      setGithubStatus('GitHub repository configuration saved.');
    } catch (_) {
      setGithubStatus('Failed to access browser storage.');
    }
  };

  // Internal helper to load contents (images and subfolders) of a folder
  const selectFolderInternal = async (token: string, folder: GoogleDriveFolder) => {
    setSelectedFolder(folder);
    setIsLoadingDrive(true);
    setDriveError(null);
    try {
      const [images, subs] = await Promise.all([
        listDriveImagesInFolder(token, folder.id),
        listSubfolders(token, folder.id),
      ]);
      setFolderImages(images);
      setSubfolders(subs);
    } catch (err: any) {
      setDriveError(err?.message || `Failed to load contents of folder [${folder.name}].`);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // 1. Google Drive: Specifically search and load the '사진' folder
  const loadTargetPhotoFolder = async (targetName: string = '사진') => {
    setIsLoadingDrive(true);
    setDriveError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Google Drive access token expired or missing. Please log in again.');
      
      const matched = await findDriveFoldersByName(token, targetName);
      setFolders(matched);

      if (matched.length > 0) {
        setRootPhotoFolder(matched[0]);
        setBreadcrumbs([]);
        await selectFolderInternal(token, matched[0]);
      } else {
        // Fallback: list all folders if specific search yields 0 matches
        const allList = await listDriveFolders(token, 100);
        const fallbackMatch = allList.filter(
          (f) => f.name.includes(targetName) || f.name.toLowerCase().includes('photo')
        );
        if (fallbackMatch.length > 0) {
          setFolders(fallbackMatch);
          setRootPhotoFolder(fallbackMatch[0]);
          setBreadcrumbs([]);
          await selectFolderInternal(token, fallbackMatch[0]);
        } else {
          setFolders(allList);
        }
      }
    } catch (err: any) {
      setDriveError(err?.message || 'An error occurred while querying Google Drive folder.');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // Load all folders (if user clicks "All Folders")
  const loadAllDriveFolders = async () => {
    setIsLoadingDrive(true);
    setDriveError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Google Drive access token not available. Please re-authenticate.');
      const list = await listDriveFolders(token, 100);
      setFolders(list);
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to list folders from Google Drive');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  useEffect(() => {
    loadTargetPhotoFolder('사진');
  }, []);

  // 2. Select folder from list
  const handleSelectFolder = async (folder: GoogleDriveFolder) => {
    setBreadcrumbs([]);
    setRootPhotoFolder(folder);
    const token = await getAccessToken();
    if (!token) {
      setDriveError('Authentication token missing.');
      return;
    }
    await selectFolderInternal(token, folder);
  };

  // Navigate deeper into a subfolder inside '사진'
  const handleNavigateToSubfolder = async (sub: GoogleDriveFolder) => {
    if (selectedFolder) {
      setBreadcrumbs((prev) => [...prev, selectedFolder]);
    }
    const token = await getAccessToken();
    if (!token) return;
    await selectFolderInternal(token, sub);
  };

  // Navigate back to a breadcrumb ancestor
  const handleNavigateToBreadcrumb = async (index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;
    const newCrumbs = breadcrumbs.slice(0, index);
    setBreadcrumbs(newCrumbs);
    const token = await getAccessToken();
    if (!token) return;
    await selectFolderInternal(token, target);
  };

  // Reset back to top-level '사진' folder
  const handleResetToRootPhotoFolder = async () => {
    if (!rootPhotoFolder) return;
    setBreadcrumbs([]);
    const token = await getAccessToken();
    if (!token) return;
    await selectFolderInternal(token, rootPhotoFolder);
  };

  // Toggle selection of an individual drive photo
  const handleToggleSelectDrivePhoto = (fileId: string) => {
    setSelectedDrivePhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  // Select all or deselect all photos in current folder
  const handleSelectAllDrivePhotos = () => {
    if (selectedDrivePhotoIds.size === folderImages.length) {
      setSelectedDrivePhotoIds(new Set());
    } else {
      setSelectedDrivePhotoIds(new Set(folderImages.map((f) => f.id)));
    }
  };

  // Helper to read local File as Data URL (base64)
  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Convert GoogleDriveFile array to PhotoItem array in high resolution
  const convertDriveFilesToPhotoItems = async (files: GoogleDriveFile[]): Promise<PhotoItem[]> => {
    const token = await getAccessToken();
    const photos: PhotoItem[] = [];

    for (const file of files) {
      // Default to high-resolution thumbnail (1600px) instead of =s0 which can fail without cookie auth
      let imageUrl = file.thumbnailLink?.replace(/=s\d+/, '=s1600') || file.thumbnailLink || '';
      if (token && file.id) {
        try {
          // Fetch as persistent base64 data URL so it never expires across reloads
          imageUrl = await fetchDriveImageAsDataUrl(token, file.id);
        } catch (e) {
          console.warn('Failed to load as Data URL, attempting blob URL fallback:', e);
          try {
            imageUrl = await fetchDriveImageBlobUrl(token, file.id);
          } catch (blobErr) {
            console.warn('Blob URL fallback also failed, keeping thumbnail:', blobErr);
          }
        }
      }

      // Convert image to 1:1 square canvas with symmetric white matting
      let aspectLabel = '1:1';
      if (imageUrl) {
        try {
          const square = await convertImageToSquareMatteDataUrl(imageUrl, 2000, 0.025);
          imageUrl = square.dataUrl;
          aspectLabel = square.aspectRatioLabel;
        } catch (e) {
          console.warn('Square canvas conversion fallback:', e);
        }
      }

      photos.push({
        id: `drive-p-${file.id}`,
        title: file.name.replace(/\.[^/.]+$/, '').toUpperCase(),
        subtitle: selectedFolder ? `${selectedFolder.name} Series` : 'Archive Plate',
        imageUrl,
        aspectRatioLabel: aspectLabel,
        year: new Date().getFullYear().toString(),
        location: 'SEOUL, KOREA',
        filmStockOrCamera: file.imageMediaMetadata?.cameraModel || 'Drive Digital Raw',
        notes: `Plate from Google Drive Folder [${selectedFolder?.name || 'Archive'}].`,
        fileSize: formatArchivalFileSize(Number(file.size)),
        isDriveAsset: true,
        driveFileId: file.id,
      });
    }
    return photos;
  };

  // 3. Create a new photobook monograph from selected photos (or all in folder)
  const handleCreatePhotobookFromDrive = async (onlySelected: boolean = false) => {
    const filesToImport = onlySelected
      ? folderImages.filter((f) => selectedDrivePhotoIds.has(f.id))
      : folderImages;

    if (filesToImport.length === 0) return;
    setIsImportingFolder(true);
    try {
      const photos = await convertDriveFilesToPhotoItems(filesToImport);
      const folderName = selectedFolder?.name || 'CURATED';

      const newMonograph: PhotoBook = {
        id: `monograph-${selectedFolder?.id || 'm'}-${Date.now()}`,
        title: folderName.toUpperCase(),
        subtitle: new Date().getFullYear().toString(),
        edition: `EDITION ${String(books.length + 1).padStart(2, '0')}`,
        year: new Date().getFullYear().toString(),
        curatorNote: `Curated from Google Drive "${folderName}" on ${formatArchivalCatalogDate(
          new Date()
        )}.`,
        coverImage: photos[0],
        photos,
      };

      const updated = [newMonograph, ...books];
      onUpdateBooks(updated);
      setSelectedBookForEdit(newMonograph);
      setSelectedDrivePhotoIds(new Set());
      setDriveError(null);
      // Automatically navigate to Tab 3 for ordering and captions!
      setActiveTab('captions');
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to create monograph.');
    } finally {
      setIsImportingFolder(false);
    }
  };

  // Add selected photos to an existing photobook
  const handleAddPhotosToExistingBook = async (targetBookId: string) => {
    const filesToImport = folderImages.filter((f) => selectedDrivePhotoIds.has(f.id));
    if (filesToImport.length === 0) return;
    setIsImportingFolder(true);
    try {
      const newPhotos = await convertDriveFilesToPhotoItems(filesToImport);
      const targetBook = books.find((b) => b.id === targetBookId);
      if (!targetBook) throw new Error('Target monograph not found.');

      const updatedBook: PhotoBook = {
        ...targetBook,
        photos: [...targetBook.photos, ...newPhotos],
      };

      const updatedBooks = books.map((b) => (b.id === targetBookId ? updatedBook : b));
      onUpdateBooks(updatedBooks);
      setSelectedBookForEdit(updatedBook);
      setSelectedDrivePhotoIds(new Set());
      setDriveError(null);
      // Automatically navigate to Tab 3!
      setActiveTab('captions');
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to add photos to monograph.');
    } finally {
      setIsImportingFolder(false);
    }
  };

  // Reorder photobooks in catalogue
  const handleMoveBook = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= books.length) return;
    const reordered = [...books];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;
    onUpdateBooks(reordered);
  };

  // Delete a photobook
  const handleDeleteBook = (bookId: string) => {
    const updated = books.filter((b) => b.id !== bookId);
    onUpdateBooks(updated);
    if (selectedBookForEdit?.id === bookId) {
      setSelectedBookForEdit(updated[0] || null);
    }
  };

  // Reorder photos within a photobook
  const handleMovePhotoInBook = (photoIndex: number, direction: 'up' | 'down') => {
    if (!selectedBookForEdit) return;
    const targetIndex = direction === 'up' ? photoIndex - 1 : photoIndex + 1;
    if (targetIndex < 0 || targetIndex >= selectedBookForEdit.photos.length) return;

    const newPhotos = [...selectedBookForEdit.photos];
    const temp = newPhotos[photoIndex];
    newPhotos[photoIndex] = newPhotos[targetIndex];
    newPhotos[targetIndex] = temp;

    const updatedBook: PhotoBook = {
      ...selectedBookForEdit,
      photos: newPhotos,
      coverImage: newPhotos[0] || selectedBookForEdit.coverImage,
    };

    setSelectedBookForEdit(updatedBook);
    onUpdateBooks(books.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
  };

  // Set photo as cover of monograph
  const handleSetCoverPhoto = (photo: PhotoItem) => {
    if (!selectedBookForEdit) return;
    const updatedBook: PhotoBook = {
      ...selectedBookForEdit,
      coverImage: photo,
    };
    setSelectedBookForEdit(updatedBook);
    onUpdateBooks(books.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
  };

  // Delete photo from monograph
  const handleDeletePhotoFromBook = (photoId: string) => {
    if (!selectedBookForEdit) return;
    const updatedPhotos = selectedBookForEdit.photos.filter((p) => p.id !== photoId);
    const updatedBook: PhotoBook = {
      ...selectedBookForEdit,
      photos: updatedPhotos,
      coverImage:
        selectedBookForEdit.coverImage.id === photoId
          ? updatedPhotos[0] || selectedBookForEdit.coverImage
          : selectedBookForEdit.coverImage,
    };
    setSelectedBookForEdit(updatedBook);
    onUpdateBooks(books.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
  };

  // Direct upload of local files to create a new monograph
  const handleUploadLocalFilesToNewMonograph = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsImportingFolder(true);
    setDriveError(null);

    try {
      const photos: PhotoItem[] = [];
      const fileList = Array.from(files);

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const rawDataUrl = await readFileAsDataUrl(file);
        let finalDataUrl = rawDataUrl;
        let aspectLabel = '1:1';
        try {
          // Convert both vertical and horizontal photos to strict 1:1 square canvas with symmetric museum white matting
          const square = await convertImageToSquareMatteDataUrl(rawDataUrl, 2000, 0.025);
          finalDataUrl = square.dataUrl;
          aspectLabel = square.aspectRatioLabel;
        } catch (convErr) {
          console.warn('Square canvas conversion error for local file:', convErr);
        }

        photos.push({
          id: `local-p-${Date.now()}-${i}`,
          title: file.name.replace(/\.[^/.]+$/, '').toUpperCase(),
          subtitle: 'Archival Plate',
          imageUrl: finalDataUrl,
          aspectRatioLabel: aspectLabel,
          year: new Date().getFullYear().toString(),
          location: 'SEOUL, KOREA',
          filmStockOrCamera: 'High-Res Digital Raw',
          notes: `Uploaded file [${file.name}].`,
          fileSize: formatArchivalFileSize(file.size),
          isDriveAsset: false,
        });
      }

      if (photos.length > 0) {
        const newMonograph: PhotoBook = {
          id: `monograph-local-${Date.now()}`,
          title: `COLLECTION ${String(books.length + 1).padStart(2, '0')}`,
          subtitle: new Date().getFullYear().toString(),
          edition: `EDITION ${String(books.length + 1).padStart(2, '0')}`,
          year: new Date().getFullYear().toString(),
          curatorNote: `Curated from ${photos.length} uploaded plates on ${formatArchivalCatalogDate(new Date())}.`,
          coverImage: photos[0],
          photos,
        };

        const updated = [newMonograph, ...books];
        onUpdateBooks(updated);
        setSelectedBookForEdit(newMonograph);
        setActiveTab('captions');
      }
    } catch (err: any) {
      setDriveError(err?.message || 'Failed to upload photo files.');
    } finally {
      setIsImportingFolder(false);
      e.target.value = '';
    }
  };

  // Direct upload of local files to append to currently selected monograph
  const handleUploadPhotosToSelectedBook = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedBookForEdit) return;

    try {
      const newPhotos: PhotoItem[] = [];
      const fileList = Array.from(files);

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const rawDataUrl = await readFileAsDataUrl(file);
        let finalDataUrl = rawDataUrl;
        let aspectLabel = '1:1';
        try {
          // Convert both vertical and horizontal photos to strict 1:1 square canvas with symmetric museum white matting
          const square = await convertImageToSquareMatteDataUrl(rawDataUrl, 2000, 0.025);
          finalDataUrl = square.dataUrl;
          aspectLabel = square.aspectRatioLabel;
        } catch (convErr) {
          console.warn('Square canvas conversion error for local plate:', convErr);
        }

        newPhotos.push({
          id: `local-p-${Date.now()}-${i}`,
          title: file.name.replace(/\.[^/.]+$/, '').toUpperCase(),
          subtitle: `${selectedBookForEdit.title} Plate`,
          imageUrl: finalDataUrl,
          aspectRatioLabel: aspectLabel,
          year: new Date().getFullYear().toString(),
          location: 'SEOUL, KOREA',
          filmStockOrCamera: 'High-Res Digital Raw',
          notes: `Uploaded plate [${file.name}].`,
          fileSize: formatArchivalFileSize(file.size),
          isDriveAsset: false,
        });
      }

      const updatedBook: PhotoBook = {
        ...selectedBookForEdit,
        photos: [...selectedBookForEdit.photos, ...newPhotos],
      };

      const updatedBooks = books.map((b) => (b.id === updatedBook.id ? updatedBook : b));
      onUpdateBooks(updatedBooks);
      setSelectedBookForEdit(updatedBook);
    } catch (err: any) {
      console.error('Failed to append photos to book:', err);
    } finally {
      e.target.value = '';
    }
  };

  // 4. Test GitHub Connection
  const handleTestGitHub = async () => {
    if (!githubToken) {
      setGithubStatus('Please provide a GitHub Personal Access Token.');
      return;
    }
    const repoInfo = parseGitHubRepoString(githubRepo, githubBranch);
    if (!repoInfo) {
      setGithubStatus('Invalid repo format. Please use "owner/repo" (e.g., jwygallery/photo).');
      return;
    }

    setIsTestingGitHub(true);
    setGithubStatus('Testing repository connection...');
    const res = await testGitHubConnection(githubToken, repoInfo.owner, repoInfo.repo);
    setIsTestingGitHub(false);

    if (res.success) {
      setGithubStatus(`Connection Verified! Repository: ${res.repoName}`);
    } else {
      setGithubStatus(`Connection Failed: ${res.error}`);
    }
  };

  // 5. Unified "COMMIT TO SERVER" handler
  const handleUnifiedCommitToServer = async () => {
    if (!githubToken) {
      setGithubStatus('Error: GitHub Personal Access Token required. Configure in settings below.');
      return;
    }
    const repoInfo = parseGitHubRepoString(githubRepo, githubBranch);
    if (!repoInfo) {
      setGithubStatus('Error: Invalid repository format (owner/repo).');
      return;
    }

    setIsSyncingGitHub(true);
    setGithubStatus('Uploading all catalog updates and metadata to server...');

    try {
      const payload = buildPhotobooksConfigPayload(
        books,
        mainBannerPhoto?.id || 'master-intro-photo',
        user.email || 'JWY',
        catalogDescription,
        informationConfig
      );
      const commitMsg = `chore(archive): sync all photobooks, catalog & settings [${new Date().toISOString()}]`;

      const result = await commitFileToGitHub(
        githubToken,
        repoInfo.owner,
        repoInfo.repo,
        'data/photobooks.json',
        payload,
        commitMsg,
        repoInfo.branch
      );

      if (result.success) {
        setGithubStatus(`✓ Success: All changes committed to server. (SHA: ${result.commitSha?.slice(0, 7)})`);
      } else {
        setGithubStatus(`Commit Failed: ${result.error}`);
      }
    } catch (err: any) {
      setGithubStatus(`Sync Error: ${err?.message}`);
    } finally {
      setIsSyncingGitHub(false);
    }
  };

  // 7. Update caption & descriptions in selected book
  const handleUpdateBookMetadata = (
    updates: Partial<PhotoBook> | keyof PhotoBook,
    val?: string
  ) => {
    if (!selectedBookForEdit) return;
    const patch: Partial<PhotoBook> =
      typeof updates === 'string' ? { [updates]: val } : updates;
    const updatedBook = { ...selectedBookForEdit, ...patch };
    setSelectedBookForEdit(updatedBook);
    const updatedList = books.map((b) => (b.id === updatedBook.id ? updatedBook : b));
    onUpdateBooks(updatedList);
  };

  const handleUpdatePhotoMetadata = (photoId: string, field: keyof PhotoItem, val: string) => {
    if (!selectedBookForEdit) return;
    const updatedPhotos = selectedBookForEdit.photos.map((p) =>
      p.id === photoId ? { ...p, [field]: val } : p
    );
    const updatedBook = {
      ...selectedBookForEdit,
      photos: updatedPhotos,
      coverImage: updatedPhotos[0] || selectedBookForEdit.coverImage,
    };
    const updatedList = books.map((b) => (b.id === updatedBook.id ? updatedBook : b));
    setSelectedBookForEdit(updatedBook);
    onUpdateBooks(updatedList);
  };

  // 8. Update Information Page Sections
  const handleUpdateInfoSection = (secId: string, field: 'title' | 'content', val: string) => {
    const updatedSections = informationConfig.sections.map((s) =>
      s.id === secId ? { ...s, [field]: val } : s
    );
    onUpdateInformationConfig({ ...informationConfig, sections: updatedSections });
  };

  const handleAddInfoSection = () => {
    const newSec = {
      id: `sec-${Date.now()}`,
      title: `${String(informationConfig.sections.length + 1).padStart(2, '0')}. New Section`,
      content: 'Enter section content description here.',
    };
    onUpdateInformationConfig({
      ...informationConfig,
      sections: [...informationConfig.sections, newSec],
    });
  };

  const handleDeleteInfoSection = (secId: string) => {
    const filtered = informationConfig.sections.filter((s) => s.id !== secId);
    onUpdateInformationConfig({ ...informationConfig, sections: filtered });
  };

  // Security Guard: Dual verification requires Google login with authorized administrator email
  if (!user || !isAuthorizedAdmin(user.email)) {
    return (
      <div className="w-full bg-[#0A0A0A] text-white py-24 px-4 min-h-screen flex items-center justify-center select-none">
        <div className="max-w-md w-full border border-red-900/60 bg-red-950/20 p-8 text-center space-y-4 shadow-2xl">
          <div className="text-[11px] font-sans text-red-400 uppercase tracking-[0.2em]">SECURITY ENFORCEMENT</div>
          <h2 className="text-xl font-light text-white tracking-tight uppercase">ACCESS RESTRICTED</h2>
          <p className="text-xs text-neutral-400 font-light leading-relaxed">
            The curator console is restricted to the designated administrator Google account. Current account ({user?.email || 'unauthenticated'}) is not authorized.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full bg-[#0A0A0A] text-white py-12 px-4 sm:px-6 min-h-screen"
      data-testid="admin-console-screen"
    >
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-white">
              Archive Management & Publishing
            </h1>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 border border-neutral-700 hover:border-white text-xs font-light tracking-tight uppercase text-neutral-300 hover:text-white rounded-none cursor-pointer transition-colors self-start sm:self-auto"
          >
            ← Return to Gallery
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 font-light text-xs tracking-tight uppercase">
          <button
            onClick={() => setActiveTab('drive-folders')}
            className={`px-4 py-2 border rounded-none cursor-pointer transition-colors ${
              activeTab === 'drive-folders'
                ? 'bg-white text-black border-white font-medium'
                : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            1. Google Drive
          </button>
          <button
            onClick={() => setActiveTab('captions')}
            className={`px-4 py-2 border rounded-none cursor-pointer transition-colors ${
              activeTab === 'captions'
                ? 'bg-white text-black border-white font-medium'
                : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            2. Monographs & Captions
          </button>
          <button
            onClick={() => setActiveTab('info-editor')}
            className={`px-4 py-2 border rounded-none cursor-pointer transition-colors ${
              activeTab === 'info-editor'
                ? 'bg-white text-black border-white font-medium'
                : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            3. Information Page
          </button>
          <button
            onClick={() => setActiveTab('github-sync')}
            className={`px-4 py-2 border rounded-none cursor-pointer transition-colors ${
              activeTab === 'github-sync'
                ? 'bg-white text-black border-white font-medium'
                : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            4. Server Sync
          </button>
        </div>

        {/* ================= TAB 1: GOOGLE DRIVE '사진' FOLDER TO PHOTOBOOKS ================= */}
        {activeTab === 'drive-folders' && (
          <section className="space-y-8">
            <div className="max-w-3xl">
              <h2 className="text-xl font-light text-white mb-2">
                Google Drive Archive
              </h2>
              <p className="text-sm text-neutral-400 font-light leading-relaxed">
                Connect directly to the <span className="text-white font-mono">'사진'</span> folder and sub-albums in Google Drive. Select photographs to create new monographs with 1:1 square white matting or append to existing collections.
              </p>
            </div>

            {/* Device Local Files Direct Upload */}
            <div className="p-4 border border-white/20 bg-neutral-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
              <div>
                <span className="text-white font-medium block">UPLOAD PHOTOGRAPHS FROM DEVICE</span>
                <span className="text-neutral-400 text-[11px] block mt-0.5">
                  Select high-resolution image files directly from your computer to create a new monograph.
                </span>
              </div>
              <label className="px-4 py-2 bg-white text-black hover:bg-neutral-200 border border-white font-mono text-xs uppercase tracking-wider font-medium rounded-none cursor-pointer transition-colors whitespace-nowrap shrink-0">
                <span>⬆ Upload from Device...</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleUploadLocalFilesToNewMonograph}
                  className="hidden"
                />
              </label>
            </div>

            {/* Quick Action & Search Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setSearchQuery('사진');
                    loadTargetPhotoFolder('사진');
                  }}
                  disabled={isLoadingDrive}
                  className="px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:border-white font-mono text-xs text-white uppercase rounded-none cursor-pointer transition-colors"
                >
                  Reload '사진' Folder
                </button>
                <button
                  onClick={loadAllDriveFolders}
                  disabled={isLoadingDrive}
                  className="px-3 py-1.5 bg-neutral-950 border border-white/10 hover:border-white/30 font-mono text-xs text-neutral-400 hover:text-white uppercase rounded-none cursor-pointer transition-colors"
                >
                  All Folders
                </button>
              </div>

              {/* Keyword Search */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadTargetPhotoFolder(searchQuery.trim() || '사진');
                  }}
                  placeholder="Search folder name..."
                  className="bg-neutral-950 border border-white/10 px-3 py-1 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-white"
                />
                <button
                  onClick={() => loadTargetPhotoFolder(searchQuery.trim() || '사진')}
                  disabled={isLoadingDrive}
                  className="px-3 py-1 bg-neutral-800 border border-neutral-700 hover:border-white font-mono text-xs text-white rounded-none cursor-pointer uppercase"
                >
                  Search
                </button>
              </div>
            </div>

            {driveError && (
              <div className="p-4 border border-red-900 bg-red-950/20 text-red-400 font-mono text-xs">
                {driveError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Folder list (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="flex items-center justify-between font-mono text-xs text-neutral-400">
                  <span>Folders ({folders.length})</span>
                  <span className="text-[10px] text-neutral-500">
                    {isLoadingDrive ? 'Searching...' : 'Ready'}
                  </span>
                </div>

                {isLoadingDrive && folders.length === 0 ? (
                  <div className="p-8 border border-white/10 text-center font-mono text-xs text-neutral-500 uppercase">
                    Searching '사진' folder in Google Drive...
                  </div>
                ) : folders.length === 0 ? (
                  <div className="p-8 border border-white/10 text-center font-mono text-xs text-neutral-500 space-y-2">
                    <p>No '사진' folder found.</p>
                    <p className="text-neutral-600">
                      Verify that a folder named '사진' exists in your Google Drive or use search above.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {folders.map((folder) => {
                      const isSelected = selectedFolder?.id === folder.id;
                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleSelectFolder(folder)}
                          className={`p-3 border text-left cursor-pointer transition-colors font-mono text-xs flex items-center justify-between ${
                            isSelected
                              ? 'border-white bg-neutral-900 text-white font-medium'
                              : 'border-white/10 hover:border-white/30 text-neutral-400 bg-neutral-950/50'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="block truncate text-white">📁 {folder.name}</span>
                            <span className="text-[10px] text-neutral-500">
                              {formatArchivalCatalogDate(folder.modifiedTime || folder.createdTime)}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-500 uppercase shrink-0">
                            {isSelected ? '[ Open ]' : 'Select'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Folder contents & Import action (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                {selectedFolder ? (
                  <div className="border border-white/10 bg-neutral-950 p-6 space-y-6">
                    {/* Folder Header & Breadcrumbs */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/10 pb-4">
                      <div className="space-y-2">
                        <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest block">
                          SELECTED DRIVE FOLDER
                        </span>
                        <h3 className="text-xl font-light text-white flex items-center gap-2">
                          <span>📁</span>
                          <span>{selectedFolder.name}</span>
                        </h3>

                        {/* Breadcrumbs Navigation */}
                        {breadcrumbs.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-neutral-400 pt-1">
                            <button
                              onClick={handleResetToRootPhotoFolder}
                              className="text-neutral-300 hover:text-white underline cursor-pointer bg-transparent border-0 p-0"
                            >
                              📁 [Root: '사진']
                            </button>
                            {breadcrumbs.map((crumb, idx) => (
                              <span key={crumb.id} className="flex items-center gap-1.5">
                                <span className="text-neutral-600">/</span>
                                <button
                                  onClick={() => handleNavigateToBreadcrumb(idx)}
                                  className="text-neutral-300 hover:text-white underline cursor-pointer bg-transparent border-0 p-0"
                                >
                                  {crumb.name}
                                </button>
                              </span>
                            ))}
                            <span className="text-neutral-600">/</span>
                            <span className="text-white font-medium">{selectedFolder.name}</span>
                          </div>
                        )}

                        <span className="font-mono text-xs text-neutral-400 block">
                          {folderImages.length} photographs found · {subfolders.length} sub-albums
                          {selectedDrivePhotoIds.size > 0 && (
                            <span className="text-white ml-2 font-medium bg-neutral-800 px-2 py-0.5">
                              {selectedDrivePhotoIds.size} selected
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Photobook Publishing & Photo Appending Actions */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        {selectedDrivePhotoIds.size > 0 ? (
                          <>
                            <button
                              onClick={() =>
                                setConfirmModal({
                                  isOpen: true,
                                  title: `Create Monograph from ${selectedDrivePhotoIds.size} Photographs`,
                                  description: `Create a new 1:1 square monograph from the selected ${selectedDrivePhotoIds.size} photographs and proceed to editor.`,
                                  action: () => handleCreatePhotobookFromDrive(true),
                                })
                              }
                              disabled={isImportingFolder}
                              className="px-4 py-2.5 bg-white text-black hover:bg-neutral-200 border border-white font-mono text-xs uppercase tracking-wider font-medium rounded-none cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                            >
                              {isImportingFolder ? 'Publishing...' : `Publish Selected (${selectedDrivePhotoIds.size}) →`}
                            </button>

                            {books.length > 0 && (
                              <div className="flex items-center gap-1.5 bg-black border border-neutral-700 px-2 py-1">
                                <select
                                  value={targetBookForAppend}
                                  onChange={(e) => setTargetBookForAppend(e.target.value)}
                                  className="bg-black text-white text-xs font-mono border-0 focus:outline-hidden"
                                >
                                  {books.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.title} ({b.photos.length}p)
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleAddPhotosToExistingBook(targetBookForAppend || books[0].id)}
                                  disabled={isImportingFolder}
                                  className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 font-mono text-xs uppercase cursor-pointer whitespace-nowrap"
                                >
                                  Add →
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() =>
                              setConfirmModal({
                                isOpen: true,
                                title: `Publish Monograph from Folder "${selectedFolder.name}"?`,
                                description: `Publish all ${folderImages.length} photographs in this folder as a new monograph with 1:1 square matting and proceed to editor.`,
                                action: () => handleCreatePhotobookFromDrive(false),
                              })
                            }
                            disabled={folderImages.length === 0 || isImportingFolder}
                            className="px-5 py-2.5 bg-white text-black hover:bg-neutral-200 border border-white font-mono text-xs uppercase tracking-wider font-medium rounded-none cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                          >
                            {isImportingFolder ? 'Publishing...' : 'Publish Full Folder as Monograph →'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Subfolders inside this folder (e.g. albums under '사진') */}
                    {subfolders.length > 0 && (
                      <div className="p-4 border border-white/10 bg-black space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest block">
                            📁 Sub-albums / Folders ({subfolders.length})
                          </span>
                          <span className="text-[10px] text-neutral-500 font-mono">
                            Click to browse sub-album
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {subfolders.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => handleNavigateToSubfolder(sub)}
                              className="p-3 border border-white/20 bg-neutral-950 hover:bg-neutral-900 hover:border-white text-left font-mono text-xs flex items-center justify-between group transition-colors rounded-none cursor-pointer"
                            >
                              <div className="truncate pr-2">
                                <span className="block truncate text-white">📁 {sub.name}</span>
                                <span className="text-[10px] text-neutral-500 block">
                                  {formatArchivalCatalogDate(sub.modifiedTime || sub.createdTime)}
                                </span>
                              </div>
                              <span className="text-[10px] text-neutral-400 group-hover:text-white shrink-0">
                                Open →
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Previews of folder images with individual photo selection */}
                    {folderImages.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest block">
                            Photographs in Folder ({folderImages.length} Plates)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleSelectAllDrivePhotos}
                              className="px-2.5 py-1 bg-neutral-900 border border-neutral-700 hover:border-white text-white font-mono text-[10px] uppercase cursor-pointer"
                            >
                              {selectedDrivePhotoIds.size === folderImages.length ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[420px] overflow-y-auto pr-1">
                          {folderImages.map((img) => {
                            const isSelected = selectedDrivePhotoIds.has(img.id);
                            return (
                              <div
                                key={img.id}
                                onClick={() => handleToggleSelectDrivePhoto(img.id)}
                                className={`border p-2 bg-black space-y-1.5 cursor-pointer transition-all relative ${
                                  isSelected
                                    ? 'border-white ring-1 ring-white bg-neutral-900'
                                    : 'border-white/10 hover:border-white/40'
                                }`}
                              >
                                <div className="absolute top-3 right-3 z-10">
                                  <div
                                    className={`w-5 h-5 flex items-center justify-center font-mono text-xs border ${
                                      isSelected
                                        ? 'bg-white text-black border-white font-bold'
                                        : 'bg-black/80 text-transparent border-white/40'
                                    }`}
                                  >
                                    ✓
                                  </div>
                                </div>

                                <SpaceArchiveMatteImage
                                  src={img.thumbnailLink?.replace(/=s\d+/, '=s600') || ''}
                                  alt={img.name}
                                  title={img.name}
                                  showArchivalStamp={false}
                                  mattePaddingClass="p-1.5"
                                  className="aspect-square"
                                />
                                <span className="block truncate text-[10px] font-mono text-neutral-400">
                                  {img.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-white/10 p-8 text-center text-neutral-500 font-mono text-xs">
                        {subfolders.length > 0 ? (
                          <p>
                            No photographs uploaded directly to this folder root.
                            <br />
                            Browse the <span className="text-white">sub-albums</span> above to inspect album photos.
                          </p>
                        ) : (
                          <p>No photograph files found in this folder.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border border-dashed border-white/10 p-12 text-center text-neutral-500 font-mono text-xs uppercase">
                    Select a folder from the left list to browse photographs.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 2: PHOTOBOOKS LIST, REORDERING & PLATE EDITOR ================= */}
        {activeTab === 'captions' && (
          <section className="space-y-8">
            <div className="max-w-3xl space-y-4">
              <h2 className="text-xl font-light text-white">
                Monographs & Captions Editor
              </h2>
              <p className="text-sm text-neutral-400 font-light leading-relaxed">
                Organize monograph exhibition sequence, reorder plates, and edit titles, curator notes, and technical metadata.
              </p>

              {/* Monographs Page Subtitle Description */}
              <div className="p-4 border border-white/10 bg-neutral-950 space-y-2 font-mono text-xs">
                <label className="text-neutral-400 uppercase tracking-widest block font-medium">
                  Monographs Page Introduction (Subtitle)
                </label>
                <textarea
                  rows={2}
                  value={catalogDescription}
                  onChange={(e) => onUpdateCatalogDescription(e.target.value)}
                  className="w-full bg-black border border-neutral-700 p-2.5 text-white focus:outline-hidden focus:border-white text-xs font-light"
                />
              </div>
            </div>

            {/* 1. Photobooks Order & Selection Bar */}
            <div className="space-y-3 border-b border-white/10 pb-6">
              <div className="flex items-center justify-between font-mono text-xs text-neutral-400">
                <span>Monograph Exhibition Sequence ({books.length})</span>
                <span className="text-[10px] text-neutral-500">
                  Use ↑ / ↓ to adjust catalog sequence
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {books.map((b, idx) => {
                  const isSelected = selectedBookForEdit?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`p-3 border transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-white bg-neutral-900 text-white'
                          : 'border-white/10 bg-neutral-950/60 hover:border-white/30 text-neutral-400'
                      }`}
                    >
                      <div
                        onClick={() => setSelectedBookForEdit(b)}
                        className="truncate flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-neutral-500">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          <span className="font-medium text-xs text-white truncate">{b.title}</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 font-mono block">
                          Plates: {b.photos.length} · {isSelected ? '[ Editing ]' : 'Click to edit'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 font-mono text-xs">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveBook(idx, 'up');
                          }}
                          title="Move Up"
                          className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-white cursor-pointer"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === books.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveBook(idx, 'down');
                          }}
                          title="Move Down"
                          className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-white cursor-pointer"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({
                              isOpen: true,
                              title: `Delete monograph "${b.title}"?`,
                              description: 'This monograph and all associated photo metadata will be removed from the gallery.',
                              action: () => handleDeleteBook(b.id),
                            });
                          }}
                          title="Delete Monograph"
                          className="px-2 py-1 bg-red-950/40 border border-red-900 hover:bg-red-900/60 text-red-400 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Detailed Editor for Currently Selected Photobook */}
            {selectedBookForEdit && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Monograph Overview Edit (4 cols) */}
                <div className="lg:col-span-4 border border-white/10 bg-neutral-950 p-6 space-y-4 font-light text-xs">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-white uppercase tracking-widest block font-medium">
                      Monograph Overview
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      Total: {selectedBookForEdit.photos.length} plates
                    </span>
                  </div>

                  <div>
                    <label className="text-neutral-500 uppercase block mb-1">Monograph Title (제목)</label>
                    <input
                      type="text"
                      value={selectedBookForEdit.title}
                      onChange={(e) => handleUpdateBookMetadata('title', e.target.value)}
                      className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-500 uppercase block mb-1">
                      Date (날짜)
                    </label>
                    <input
                      type="text"
                      value={selectedBookForEdit.subtitle ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleUpdateBookMetadata({ subtitle: val, year: val });
                      }}
                      placeholder="e.g., 2024 or 2024.10"
                      className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-500 uppercase block mb-1">
                      Curator Note / Comment (코멘트)
                    </label>
                    <textarea
                      rows={5}
                      value={selectedBookForEdit.curatorNote ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleUpdateBookMetadata('curatorNote', val);
                      }}
                      placeholder="Enter monograph curator note or artistic comment..."
                      className="w-full bg-black border border-neutral-700 p-3 text-white focus:outline-hidden focus:border-white text-xs font-light"
                    />
                  </div>

                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <span className="text-neutral-400 uppercase text-[10px] tracking-widest block">
                      Active Cover Artwork
                    </span>
                    <div className="bg-white p-2 w-32 h-32 flex items-center justify-center mx-auto">
                      <img
                        src={selectedBookForEdit.coverImage.imageUrl}
                        alt={selectedBookForEdit.coverImage.title}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <span className="block text-center text-[10px] text-neutral-400 truncate">
                      {selectedBookForEdit.coverImage.title}
                    </span>
                  </div>
                </div>

                {/* Individual Photo Details & Plate Reordering (8 cols) */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-neutral-400 border-b border-white/10 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="uppercase tracking-widest">
                        Plates Sequence ({selectedBookForEdit.photos.length} Plates)
                      </span>
                      <label className="px-2.5 py-1 bg-white text-black hover:bg-neutral-200 border border-white text-[10px] uppercase font-medium cursor-pointer transition-colors whitespace-nowrap">
                        <span>＋ Upload Photos from Device</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleUploadPhotosToSelectedBook}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <span className="text-[10px] text-neutral-500">
                      Use ↑ / ↓ to adjust plate sequence
                    </span>
                  </div>

                  <div className="space-y-4">
                    {selectedBookForEdit.photos.map((photo, pIdx) => {
                      const isCover = selectedBookForEdit.coverImage.id === photo.id;
                      return (
                        <div
                          key={photo.id}
                          className="p-4 border border-white/10 bg-neutral-950/80 grid grid-cols-1 md:grid-cols-12 gap-4 font-mono text-xs items-start"
                        >
                          <div className="md:col-span-3 bg-white p-2 aspect-square flex items-center justify-center relative">
                            {isCover && (
                              <div className="absolute top-1 left-1 bg-black text-white text-[9px] px-1.5 py-0.5 uppercase tracking-wider font-bold">
                                COVER
                              </div>
                            )}
                            <img
                              src={photo.imageUrl}
                              alt={photo.title}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>

                          <div className="md:col-span-9 space-y-3">
                            {/* Reorder and Action Toolbar */}
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                              <span className="text-neutral-400 text-[11px] font-medium">
                                PLATE #{String(pIdx + 1).padStart(2, '0')}
                              </span>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={pIdx === 0}
                                  onClick={() => handleMovePhotoInBook(pIdx, 'up')}
                                  title="Move Up"
                                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-white cursor-pointer text-[10px]"
                                >
                                  ↑ Up
                                </button>
                                <button
                                  type="button"
                                  disabled={pIdx === selectedBookForEdit.photos.length - 1}
                                  onClick={() => handleMovePhotoInBook(pIdx, 'down')}
                                  title="Move Down"
                                  className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-white cursor-pointer text-[10px]"
                                >
                                  ↓ Down
                                </button>
                                {!isCover && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetCoverPhoto(photo)}
                                    title="Set as monograph cover"
                                    className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 hover:border-white text-white cursor-pointer text-[10px]"
                                  >
                                    ✦ Set Cover
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmModal({
                                      isOpen: true,
                                      title: `Remove plate "${photo.title}"?`,
                                      description: `This photograph plate will be removed from "${selectedBookForEdit.title}".`,
                                      action: () => handleDeletePhotoFromBook(photo.id),
                                    });
                                  }}
                                  title="Remove from Monograph"
                                  className="px-2 py-0.5 bg-red-950/40 border border-red-900 hover:bg-red-900/60 text-red-400 cursor-pointer text-[10px]"
                                >
                                  ✕ Remove
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-neutral-500 uppercase block mb-0.5 text-[10px]">
                                  Plate Title (제목)
                                </label>
                                <input
                                  type="text"
                                  value={photo.title}
                                  onChange={(e) => handleUpdatePhotoMetadata(photo.id, 'title', e.target.value)}
                                  className="w-full bg-black border border-neutral-700 px-2 py-1 text-white focus:outline-hidden focus:border-white text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-neutral-500 uppercase block mb-0.5 text-[10px]">
                                  Series (시리즈)
                                </label>
                                <input
                                  type="text"
                                  value={photo.subtitle || ''}
                                  onChange={(e) => handleUpdatePhotoMetadata(photo.id, 'subtitle', e.target.value)}
                                  placeholder="e.g., #2 Series"
                                  className="w-full bg-black border border-neutral-700 px-2 py-1 text-white focus:outline-hidden focus:border-white text-xs"
                                />
                              </div>
                            </div>


                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-neutral-500 uppercase block mb-0.5 text-[10px]">
                                  Location
                                </label>
                                <input
                                  type="text"
                                  value={photo.location || ''}
                                  onChange={(e) => handleUpdatePhotoMetadata(photo.id, 'location', e.target.value)}
                                  className="w-full bg-black border border-neutral-700 px-2 py-1 text-white focus:outline-hidden focus:border-white text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-neutral-500 uppercase block mb-0.5 text-[10px]">
                                  Camera / Film
                                </label>
                                <input
                                  type="text"
                                  value={photo.filmStockOrCamera || ''}
                                  onChange={(e) =>
                                    handleUpdatePhotoMetadata(photo.id, 'filmStockOrCamera', e.target.value)
                                  }
                                  className="w-full bg-black border border-neutral-700 px-2 py-1 text-white focus:outline-hidden focus:border-white text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================= TAB 4: INFORMATION PAGE EDITOR ================= */}
        {activeTab === 'info-editor' && (
          <section className="space-y-8">
            <div className="max-w-3xl">
              <h2 className="text-xl font-light text-white mb-2">
                Information Page Editor
              </h2>
              <p className="text-sm text-neutral-400 font-light leading-relaxed">
                Customize the titles, headings, and individual section descriptions shown on the INFORMATION page.
              </p>
            </div>

            <div className="space-y-6 max-w-4xl">
              {/* Header Titles */}
              <div className="p-6 border border-white/10 bg-neutral-950 grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
                <div>
                  <label className="text-neutral-500 uppercase block mb-1">Top Kicker Label</label>
                  <input
                    type="text"
                    value={informationConfig.kicker}
                    onChange={(e) =>
                      onUpdateInformationConfig({ ...informationConfig, kicker: e.target.value })
                    }
                    className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-neutral-500 uppercase block mb-1">Main Heading</label>
                  <input
                    type="text"
                    value={informationConfig.heading}
                    onChange={(e) =>
                      onUpdateInformationConfig({ ...informationConfig, heading: e.target.value })
                    }
                    className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white"
                  />
                </div>
              </div>

              {/* Individual Sections */}
              <div className="space-y-4">
                <div className="flex items-center justify-between font-mono text-xs text-neutral-400">
                  <span>INFORMATION SECTIONS ({informationConfig.sections.length})</span>
                  <button
                    onClick={handleAddInfoSection}
                    className="px-3 py-1 bg-white text-black font-medium uppercase tracking-wider rounded-none cursor-pointer"
                  >
                    + ADD SECTION
                  </button>
                </div>

                {informationConfig.sections.map((sec, idx) => (
                  <div key={sec.id} className="p-6 border border-white/10 bg-neutral-950 font-mono text-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 uppercase">SECTION #{idx + 1}</span>
                      <button
                        onClick={() => handleDeleteInfoSection(sec.id)}
                        className="text-red-400 hover:text-red-300 uppercase underline cursor-pointer bg-transparent border-0 p-0"
                      >
                        DELETE SECTION
                      </button>
                    </div>

                    <div>
                      <label className="text-neutral-500 uppercase block mb-1">Subheading</label>
                      <input
                        type="text"
                        value={sec.title}
                        onChange={(e) => handleUpdateInfoSection(sec.id, 'title', e.target.value)}
                        className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white"
                      />
                    </div>

                    <div>
                      <label className="text-neutral-500 uppercase block mb-1">Section Content</label>
                      <textarea
                        rows={4}
                        value={sec.content}
                        onChange={(e) => handleUpdateInfoSection(sec.id, 'content', e.target.value)}
                        className="w-full bg-black border border-neutral-700 p-3 text-white focus:outline-hidden focus:border-white text-xs font-light"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 5: SIMPLE SERVER COMMIT (COMMIT TO SERVER) ================= */}
        {activeTab === 'github-sync' && (
          <section className="py-12 px-4 max-w-2xl mx-auto text-center space-y-8 select-none">
            <div className="space-y-6">
              <button
                onClick={handleUnifiedCommitToServer}
                disabled={isSyncingGitHub}
                className="w-full py-5 bg-white text-black hover:bg-neutral-200 border-2 border-white font-mono text-sm sm:text-base uppercase tracking-[0.25em] font-medium rounded-none cursor-pointer transition-all disabled:opacity-50 shadow-2xl shadow-black active:translate-y-0.5"
              >
                {isSyncingGitHub ? 'COMMITTING ALL CHANGES TO SERVER...' : 'COMMIT TO SERVER'}
              </button>

              {githubStatus && (
                <div
                  className={`p-4 border font-mono text-xs leading-relaxed ${
                    githubStatus.includes('Success') || githubStatus.includes('Verified')
                      ? 'border-emerald-800 bg-emerald-950/30 text-emerald-300'
                      : githubStatus.includes('Error') || githubStatus.includes('Failed')
                      ? 'border-red-800 bg-red-950/30 text-red-400'
                      : 'border-white/20 bg-neutral-950 text-neutral-300'
                  }`}
                >
                  {githubStatus}
                </div>
              )}
            </div>

            {/* Collapsible Repository Configuration */}
            <div className="pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowGitHubAdvanced(!showGitHubAdvanced)}
                className="text-neutral-500 hover:text-neutral-300 text-[11px] font-mono uppercase tracking-wider underline bg-transparent border-0 cursor-pointer"
              >
                {showGitHubAdvanced ? '▲ HIDE REPOSITORY CONFIGURATION' : '▼ REPOSITORY CONFIGURATION'}
              </button>

              {showGitHubAdvanced && (
                <div className="mt-6 p-6 border border-white/10 bg-neutral-950 text-left font-mono text-xs space-y-4">
                  <div>
                    <label className="text-neutral-500 uppercase block mb-1">
                      GitHub Personal Access Token (PAT)
                    </label>
                    <input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-500 uppercase block mb-1">
                      Repository Name (owner/repo)
                    </label>
                    <input
                      type="text"
                      placeholder="jwygallery/photo"
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-500 uppercase block mb-1">Target Branch</label>
                    <input
                      type="text"
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      className="w-full bg-black border border-neutral-700 px-3 py-2 text-white focus:outline-hidden focus:border-white"
                    />
                  </div>

                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      onClick={handleSaveGitHubConfig}
                      className="px-4 py-2 bg-neutral-900 border border-neutral-700 hover:border-neutral-500 text-white cursor-pointer uppercase tracking-wider"
                    >
                      SAVE CONFIG
                    </button>
                    <button
                      onClick={handleTestGitHub}
                      disabled={isTestingGitHub}
                      className="px-4 py-2 bg-neutral-900 border border-neutral-700 hover:border-white text-white cursor-pointer uppercase tracking-wider disabled:opacity-50"
                    >
                      {isTestingGitHub ? 'TESTING...' : 'TEST CONNECTION'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Confirmation modal for critical actions */}
      <ConfirmationDialog
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel="PROCEED"
        cancelLabel="CANCEL"
        onConfirm={() => {
          confirmModal.action();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
