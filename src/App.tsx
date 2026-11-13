/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import { PhotoBook, PhotoItem } from './types/photobook.ts';
import { CURATED_PHOTOBOOKS, MASTER_INTRO_PHOTO } from './data/curatedPhotobooks.ts';
import { initAuth, googleSignIn, logout, isAuthorizedAdmin } from './services/firebaseAuth.ts';

import IntroScreen from './components/IntroScreen.tsx';
import TopNav from './components/TopNav.tsx';
import PhotoBookList from './components/PhotoBookList.tsx';
import PhotoBookDetail from './components/PhotoBookDetail.tsx';
import InformationView, {
  InformationConfig,
  DEFAULT_INFORMATION_CONFIG,
} from './components/InformationView.tsx';
import AdminConsole from './components/AdminConsole.tsx';
import AdminPasswordModal from './components/AdminPasswordModal.tsx';
import Footer from './components/Footer.tsx';
import { parseGitHubRepoString, detectDefaultGitHubRepo } from './utils/githubSync.ts';
import { fetchRemotePhotobooksConfig } from './services/githubService.ts';

type ViewMode = 'intro' | 'list' | 'info' | 'detail' | 'admin';

interface ParsedHashRoute {
  viewMode: ViewMode;
  bookId?: string;
}

function parseHashRoute(rawHash: string): ParsedHashRoute {
  const hash = (rawHash || '').trim();
  if (!hash || hash === '#' || hash === '#/') {
    return { viewMode: 'intro' };
  }
  if (hash === '#/list' || hash.startsWith('#/list?')) {
    return { viewMode: 'list' };
  }
  if (hash === '#/info' || hash.startsWith('#/info?')) {
    return { viewMode: 'info' };
  }
  if (hash === '#/admin' || hash.startsWith('#/admin?')) {
    return { viewMode: 'admin' };
  }
  if (hash.startsWith('#/book/')) {
    const rawId = hash.slice('#/book/'.length).split('?')[0].trim();
    try {
      const bookId = decodeURIComponent(rawId);
      if (bookId) {
        return { viewMode: 'detail', bookId };
      }
    } catch {
      if (rawId) {
        return { viewMode: 'detail', bookId: rawId };
      }
    }
    return { viewMode: 'list' };
  }
  return { viewMode: 'intro' };
}

export default function App() {
  // Photobooks Catalogue state (purged of legacy sample monographs)
  const [books, setBooks] = useState<PhotoBook[]>(() => {
    try {
      const saved = localStorage.getItem('jwy_photobooks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const sampleIds = new Set(['vol-01-monolith', 'vol-02-horizon', 'vol-03-helix', 'vol-04-desert']);
          const filtered = parsed.filter((b: PhotoBook) => !sampleIds.has(b.id));
          localStorage.setItem('jwy_photobooks', JSON.stringify(filtered));
          return filtered;
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached photobooks:', e);
    }
    return CURATED_PHOTOBOOKS;
  });

  // Navigation View: 'intro' | 'list' | 'info' | 'detail' | 'admin'
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash;
      const params = new URLSearchParams(window.location.search);
      if (
        params.get('autostart') === '1' &&
        (!currentHash || currentHash === '#' || currentHash === '#/')
      ) {
        return 'list';
      }
      return parseHashRoute(currentHash).viewMode;
    }
    return 'intro';
  });

  // Archive loading state for initial fetch
  const [isLoadingArchive, setIsLoadingArchive] = useState<boolean>(true);

  // Master Intro Banner Photo (fixed permanently with museum-grade 1:1 square white matting)
  const mainBannerPhoto: PhotoItem = MASTER_INTRO_PHOTO;

  // Monograph Collections Subtitle Description
  const [catalogDescription, setCatalogDescription] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('jwy_catalog_desc');
      if (saved) {
        const trimmed = saved.trim();
        if (
          trimmed.startsWith('A meditative sequence of black and white spatial inquiries')
        ) {
          localStorage.removeItem('jwy_catalog_desc');
          return '';
        }
        return saved;
      }
    } catch (e) {
      console.warn('Failed to load cached catalog desc:', e);
    }
    return '';
  });

  // Information page customizable content
  const [informationConfig, setInformationConfig] = useState<InformationConfig>(() => {
    try {
      const saved = localStorage.getItem('jwy_info_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.heading && Array.isArray(parsed?.sections)) {
          const hasLegacyPlaceholder = parsed.sections.some(
            (s: any) => s?.title === '01. Archival Mission'
          );
          if (hasLegacyPlaceholder) {
            localStorage.removeItem('jwy_info_config');
            return DEFAULT_INFORMATION_CONFIG;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load cached info config:', e);
    }
    return DEFAULT_INFORMATION_CONFIG;
  });

  const [selectedBook, setSelectedBook] = useState<PhotoBook | null>(() => {
    if (typeof window !== 'undefined') {
      const route = parseHashRoute(window.location.hash);
      if (route.viewMode === 'detail' && route.bookId) {
        return books.find((b) => b.id === route.bookId) || null;
      }
    }
    return null;
  });

  const booksRef = useRef<PhotoBook[]>(books);
  booksRef.current = books;

  const isLoadingArchiveRef = useRef<boolean>(isLoadingArchive);
  isLoadingArchiveRef.current = isLoadingArchive;

  // Navigate and synchronize state -> window.location.hash
  const navigateTo = useCallback((mode: ViewMode, book?: PhotoBook | null) => {
    setSelectedBook(book ?? null);
    setViewMode(mode);

    if (typeof window !== 'undefined') {
      let targetHash = '#/';
      if (mode === 'list') targetHash = '#/list';
      else if (mode === 'info') targetHash = '#/info';
      else if (mode === 'admin') targetHash = '#/admin';
      else if (mode === 'detail' && book) {
        targetHash = `#/book/${encodeURIComponent(book.id)}`;
      }

      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
      window.scrollTo(0, 0);
    }
  }, []);

  // Synchronize URL hash <-> viewMode & selectedBook (supports browser Back/Forward & direct URL entry)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentHash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('autostart') === '1' &&
      (!currentHash || currentHash === '#' || currentHash === '#/')
    ) {
      window.location.hash = '#/list';
      setViewMode('list');
      setSelectedBook(null);
    }

    const handleHashChange = () => {
      const route = parseHashRoute(window.location.hash);
      if (route.viewMode === 'detail' && route.bookId) {
        const matched = booksRef.current.find((b) => b.id === route.bookId);
        if (matched) {
          setSelectedBook(matched);
          setViewMode('detail');
        } else if (isLoadingArchiveRef.current) {
          setSelectedBook(null);
          setViewMode('detail');
        } else {
          setSelectedBook(null);
          setViewMode('list');
          if (window.location.hash !== '#/list') {
            window.location.hash = '#/list';
          }
        }
      } else {
        setSelectedBook(null);
        setViewMode(route.viewMode);
      }
      window.scrollTo(0, 0);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Resolve direct link (#/book/<book.id>) once asynchronous GitHub archive loading completes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const route = parseHashRoute(window.location.hash);
    if (route.viewMode === 'detail' && route.bookId) {
      const matched = books.find((b) => b.id === route.bookId);
      if (matched) {
        setSelectedBook(matched);
        setViewMode('detail');
      } else if (!isLoadingArchive) {
        setSelectedBook(null);
        setViewMode('list');
        if (window.location.hash !== '#/list') {
          window.location.hash = '#/list';
        }
      }
    }
  }, [books, isLoadingArchive]);

  // Reset scroll position to top on every view or selected book transition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [viewMode, selectedBook?.id]);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => {
        setUser(currentUser);
      },
      () => {
        setUser(null);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Fetch published archive from GitHub repository so all visitors see latest monographs
  useEffect(() => {
    let isCancelled = false;

    async function loadRemoteArchive() {
      try {
        let repoStr =
          localStorage.getItem('jwy_gh_repo') ||
          detectDefaultGitHubRepo();

        // Self-heal: correct legacy repo string if present in browser localStorage
        if (
          repoStr === 'iamcoolkorean/jwy-photobook' ||
          repoStr === 'iamcoolkorean/jwyphotobook'
        ) {
          repoStr = 'jwygallery/photo';
          try {
            localStorage.setItem('jwy_gh_repo', repoStr);
          } catch (_) {}
        }

        const branchStr =
          localStorage.getItem('jwy_gh_branch') ||
          (import.meta as any).env?.VITE_GITHUB_BRANCH ||
          'main';
        // Visitors always fetch from public GitHub without any PAT token
        const tokenStr = undefined;

        const repoInfo = parseGitHubRepoString(repoStr, branchStr);
        if (!repoInfo) {
          setIsLoadingArchive(false);
          return;
        }

        const remoteData = await fetchRemotePhotobooksConfig(
          repoInfo.owner,
          repoInfo.repo,
          repoInfo.branch,
          tokenStr
        );

        if (!isCancelled && remoteData) {
          if (remoteData.books && Array.isArray(remoteData.books)) {
            const sampleIds = new Set(['vol-01-monolith', 'vol-02-horizon', 'vol-03-helix', 'vol-04-desert']);
            const cleanBooks = remoteData.books.filter((b: PhotoBook) => !sampleIds.has(b.id));
            setBooks(cleanBooks);
            try {
              localStorage.setItem('jwy_photobooks', JSON.stringify(cleanBooks));
            } catch (e) {
              console.warn(e);
            }

            if (typeof window !== 'undefined') {
              const currentRoute = parseHashRoute(window.location.hash);
              if (currentRoute.viewMode === 'detail' && currentRoute.bookId) {
                const matched = cleanBooks.find((b: PhotoBook) => b.id === currentRoute.bookId);
                if (matched) {
                  setSelectedBook(matched);
                  setViewMode('detail');
                } else {
                  setSelectedBook(null);
                  setViewMode('list');
                  if (window.location.hash !== '#/list') {
                    window.location.hash = '#/list';
                  }
                }
              }
            }

            // Sync catalog description (Collections Subtitle)
            if (typeof remoteData.catalogDescription === 'string') {
              setCatalogDescription(remoteData.catalogDescription);
              try {
                localStorage.setItem('jwy_catalog_desc', remoteData.catalogDescription);
              } catch (e) {
                console.warn(e);
              }
            }

            // Sync information config
            if (remoteData.informationConfig) {
              setInformationConfig(remoteData.informationConfig);
              try {
                localStorage.setItem('jwy_info_config', JSON.stringify(remoteData.informationConfig));
              } catch (e) {
                console.warn(e);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not sync remote photobooks from GitHub:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingArchive(false);
        }
      }
    }

    loadRemoteArchive();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Sync document title and social share card representative image with active main banner
  useEffect(() => {
    document.title = 'Photo Book';
    if (mainBannerPhoto?.imageUrl && typeof document !== 'undefined') {
      const ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) ogImg.setAttribute('content', mainBannerPhoto.imageUrl);
      const twImg = document.querySelector('meta[name="twitter:image"]');
      if (twImg) twImg.setAttribute('content', mainBannerPhoto.imageUrl);
    }
  }, [mainBannerPhoto]);

  // Update photobooks catalogue and persist
  const handleUpdateBooks = (updated: PhotoBook[]) => {
    setBooks(updated);
    try {
      localStorage.setItem('jwy_photobooks', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to cache photobooks to localStorage:', e);
    }
  };

  // Update catalog description and persist
  const handleUpdateCatalogDescription = (desc: string) => {
    setCatalogDescription(desc);
    try {
      localStorage.setItem('jwy_catalog_desc', desc);
    } catch (e) {
      console.warn('Failed to cache catalog description:', e);
    }
  };

  // Update information configuration and persist
  const handleUpdateInformationConfig = (cfg: InformationConfig) => {
    setInformationConfig(cfg);
    try {
      localStorage.setItem('jwy_info_config', JSON.stringify(cfg));
    } catch (e) {
      console.warn('Failed to cache info config:', e);
    }
  };

  // Initiate login process: first prompt for master password
  const handleStartLogin = () => {
    setIsPasswordModalOpen(true);
  };

  // Login via Google Sign-In with Google Drive scopes after password verification
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        if (!isAuthorizedAdmin(result.user.email)) {
          await logout();
          setUser(null);
          setAuthError(`Access denied: Google account "${result.user.email}" is not authorized as curator administrator.`);
          return;
        }
        setUser(result.user);
        navigateTo('admin');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(err?.message || 'Authentication failed or account unauthorized.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      if (viewMode === 'admin') {
        navigateTo('list');
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white selection:bg-white selection:text-black flex flex-col">
      {/* Admin Password Gate Modal */}
      <AdminPasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => {
          setIsPasswordModalOpen(false);
          handleLogin();
        }}
      />

      {/* 1. INTRO SCREEN: Single grand representative photograph, clean of explanations */}
      {viewMode === 'intro' ? (
        <IntroScreen
          onEnter={() => navigateTo('list')}
          bannerPhoto={mainBannerPhoto}
        />
      ) : (
        /* MAIN GALLERY SHELL */
        <div className="flex flex-col min-h-screen">
          {/* Top Navigation: JWY PHOTO BOOK — MONOGRAPHS / INFORMATION — LOGIN */}
          <TopNav
            currentView={
              viewMode === 'admin'
                ? 'admin'
                : viewMode === 'info'
                ? 'info'
                : 'list'
            }
            onSelectView={(target) => {
              navigateTo(target);
            }}
            user={user}
            onLogin={handleStartLogin}
            onLogout={handleLogout}
            isLoggingIn={isLoggingIn}
            onReturnToIntro={() => navigateTo('intro')}
          />

          {/* Security / Auth Alert Notice */}
          {authError && (
            <div className="bg-red-950/80 border-b border-red-900/80 text-red-300 text-xs py-3 px-4 sm:px-8 flex items-center justify-between">
              <span className="font-light tracking-tight">{authError}</span>
              <button
                onClick={() => setAuthError(null)}
                className="text-red-400 hover:text-white uppercase text-[10px] tracking-widest ml-4 cursor-pointer"
              >
                [ DISMISS ]
              </button>
            </div>
          )}

          {/* Main Content Pane */}
          <main className="flex-1">
            {/* View A: Detail Monograph View */}
            {viewMode === 'detail' && selectedBook && (
              <PhotoBookDetail
                book={books.find((b) => b.id === selectedBook.id) || selectedBook}
                onBack={() => {
                  navigateTo('list');
                }}
              />
            )}

            {/* View B: Single Column Photo Book List */}
            {(viewMode === 'list' || (viewMode === 'detail' && !selectedBook)) && (
              <PhotoBookList
                books={books}
                catalogDescription={catalogDescription}
                isLoading={isLoadingArchive}
                onSelectBook={(book) => {
                  navigateTo('detail', book);
                }}
              />
            )}

            {/* View C: Information Page */}
            {viewMode === 'info' && (
              <InformationView
                config={informationConfig}
                onBackToCatalog={() => navigateTo('list')}
              />
            )}

            {/* View D: Admin Console (Requires dual verification: password + authorized admin Google account) */}
            {viewMode === 'admin' && (
              user && isAuthorizedAdmin(user.email) ? (
                <AdminConsole
                  user={user}
                  books={books}
                  onUpdateBooks={handleUpdateBooks}
                  mainBannerPhoto={mainBannerPhoto}
                  catalogDescription={catalogDescription}
                  onUpdateCatalogDescription={handleUpdateCatalogDescription}
                  informationConfig={informationConfig}
                  onUpdateInformationConfig={handleUpdateInformationConfig}
                  onClose={() => navigateTo('list')}
                />
              ) : (
                <div className="max-w-md mx-auto my-24 p-8 border border-white/20 bg-neutral-950 text-center font-mono text-xs space-y-4">
                  <span className="text-neutral-500 uppercase tracking-widest block">
                    ADMIN AUTHENTICATION REQUIRED
                  </span>
                  <p className="text-neutral-300 font-light">
                    Sign in with Google to access the curator console, Google Drive folder importer, and GitHub publishing tools.
                  </p>
                  <button
                    onClick={handleStartLogin}
                    disabled={isLoggingIn}
                    className="w-full py-3 bg-white text-black hover:bg-neutral-200 border border-white font-medium uppercase tracking-wider rounded-none cursor-pointer transition-colors"
                  >
                    {isLoggingIn ? 'AUTHENTICATING...' : 'SIGN IN WITH GOOGLE'}
                  </button>
                </div>
              )
            )}
          </main>

          {/* Site Footer: ORGANIZER: JWY · SEOUL, KOREA */}
          <Footer />
        </div>
      )}
    </div>
  );
}
