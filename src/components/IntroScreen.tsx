import { MASTER_INTRO_PHOTO } from '../data/curatedPhotobooks.ts';
import { PhotoItem } from '../types/photobook.ts';
import SpaceArchiveMatteImage from './SpaceArchiveMatteImage.tsx';

interface IntroScreenProps {
  onEnter: () => void;
  bannerPhoto?: PhotoItem;
}

/**
 * Intro View:
 * Purely displays the single monumental representative photograph centered on the #0A0A0A canvas.
 * Free of captions, subtexts, and extraneous descriptors.
 * Bottom footer only retains the organizer accreditation on the right.
 */
export default function IntroScreen({ onEnter, bannerPhoto }: IntroScreenProps) {
  const photo = bannerPhoto || MASTER_INTRO_PHOTO;

  return (
    <div
      className="min-h-screen w-full bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-4 sm:p-8 md:p-12 relative overflow-hidden select-none"
      data-testid="intro-screen"
    >
      {/* Main Single Centered Master Photograph - Pristine & Free of Explanations */}
      <main className="w-full max-w-[540px] sm:max-w-[620px] md:max-w-[680px] flex flex-col items-center my-auto">
        <button
          onClick={onEnter}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onEnter();
            }
          }}
          aria-label="Enter Photo Book Gallery by clicking the photograph"
          className="w-full text-left focus:outline-hidden focus-visible:ring-1 focus-visible:ring-white group block rounded-none p-0 bg-transparent border-0 cursor-pointer"
        >
          {/* 1:1 Square White-Matte Master Presentation - Pure Image Only */}
          <div className="relative transform transition-transform duration-700 ease-out group-hover:scale-[1.012]">
            <SpaceArchiveMatteImage
              src={photo.imageUrl}
              alt={photo.title}
              title={photo.title}
              showArchivalStamp={false}
              priority={true}
              mattePaddingClass="p-0"
              className="shadow-2xl shadow-black/80"
            />
          </div>
        </button>
      </main>

      {/* Bottom Footer: Left logo deleted, right contains ARCHIVE BY JWY · SEOUL, KOREA */}
      <footer className="absolute bottom-6 sm:bottom-10 left-6 sm:left-12 right-6 sm:right-12 flex justify-end items-center text-[10px] sm:text-xs font-light tracking-tight">
        <span className="text-neutral-400 uppercase">ARCHIVE BY JWY · SEOUL, KOREA</span>
      </footer>
    </div>
  );
}
