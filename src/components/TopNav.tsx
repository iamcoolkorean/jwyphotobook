import { User } from 'firebase/auth';

interface TopNavProps {
  currentView: 'list' | 'info' | 'admin';
  onSelectView: (view: 'list' | 'info' | 'admin') => void;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  isLoggingIn: boolean;
  onReturnToIntro: () => void;
}

/**
 * Top navigation conforming to user requirements:
 * Left: Site name (JWY PHOTO BOOK)
 * Center: MONOGRAPHS and INFORMATION
 * Right: LOGIN button (or ADMIN CONSOLE indicator when authenticated)
 * Zero-pill, high contrast black & white.
 */
export default function TopNav({
  currentView,
  onSelectView,
  user,
  onLogin,
  onLogout,
  isLoggingIn,
  onReturnToIntro,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#0A0A0A]/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-8 md:px-12 py-3 sm:py-4 select-none">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-6">
        {/* Left Zone: Site Name with narrowed letter-spacing matching Monograph Collections font */}
        <button
          onClick={onReturnToIntro}
          title="Return to Master Intro Photograph"
          className="text-left bg-transparent border-0 p-0 text-white font-sans font-light text-xs sm:text-base tracking-tight uppercase hover:text-neutral-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          JWY PHOTOBOOK
        </button>

        {/* Center Zone: Monographs and Information with smaller size and matched font */}
        <nav className="flex items-center gap-2.5 sm:gap-6 text-[11px] sm:text-xs font-sans font-light tracking-tight">
          <button
            onClick={() => onSelectView('list')}
            className={`transition-colors whitespace-nowrap shrink-0 bg-transparent border-0 p-0 cursor-pointer ${
              currentView === 'list'
                ? 'text-white border-b border-white pb-0.5 font-normal'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Monographs
          </button>
          <button
            onClick={() => onSelectView('info')}
            className={`transition-colors whitespace-nowrap shrink-0 bg-transparent border-0 p-0 cursor-pointer ${
              currentView === 'info'
                ? 'text-white border-b border-white pb-0.5 font-normal'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Information
          </button>
        </nav>

        {/* Right Zone: LOGIN / ADMIN CONSOLE Button */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 font-sans font-light tracking-tight">
          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => onSelectView('admin')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs rounded-none cursor-pointer transition-colors whitespace-nowrap ${
                  currentView === 'admin'
                    ? 'bg-white text-black border border-white font-normal'
                    : 'text-white bg-neutral-900 border border-neutral-700 hover:bg-neutral-800'
                }`}
              >
                Admin
              </button>
              <button
                onClick={onLogout}
                className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-neutral-400 hover:text-white bg-transparent border border-neutral-800 hover:border-neutral-600 rounded-none cursor-pointer transition-colors whitespace-nowrap"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={onLogin}
              disabled={isLoggingIn}
              className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[10px] sm:text-xs text-black bg-white hover:bg-neutral-200 border border-white rounded-none transition-colors cursor-pointer whitespace-nowrap font-normal disabled:opacity-50"
            >
              {isLoggingIn ? 'Logging in...' : 'Login'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
