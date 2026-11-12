import { useState } from 'react';
import { PhotoBook, PhotoItem } from '../types/photobook.ts';
import SpaceArchiveMatteImage from './SpaceArchiveMatteImage.tsx';

interface PhotoBookDetailProps {
  book: PhotoBook;
  onBack: () => void;
}

/**
 * Detail view for an individual photo book monograph.
 * Displays all plates with Space Archive 1:1 white matting.
 * Clicking a plate reveals provenance and apparatus details.
 */
export default function PhotoBookDetail({ book, onBack }: PhotoBookDetailProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);

  return (
    <div className="w-full bg-[#0A0A0A] text-white min-h-screen py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between pb-8 mb-12 border-b border-white/10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-light tracking-tight uppercase text-neutral-400 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer"
          >
            <span aria-hidden="true">←</span>
            <span>Return to Monograph Catalog</span>
          </button>
        </div>

        {/* Monograph Title & Curator Note */}
        <header className="mb-20 space-y-4">
          <h1 className="text-3xl sm:text-5xl font-light tracking-tight text-white">
            {book.title}
          </h1>
          {(book.curatorNote || book.subtitle) && (
            <p className="text-sm sm:text-base font-light text-neutral-400 leading-relaxed max-w-2xl whitespace-pre-line">
              {book.curatorNote || book.subtitle}
            </p>
          )}
        </header>

        {/* Plates in Monograph: Single column gallery with 1:1 matting */}
        <div className="space-y-32">
          {book.photos.map((photo, pIdx) => (
            <div key={photo.id} className="space-y-6">
              <div
                className="cursor-zoom-in"
                onClick={() => setSelectedPhoto(photo)}
              >
                <SpaceArchiveMatteImage
                  src={photo.imageUrl}
                  alt={photo.title}
                  title={photo.title}
                  archivalCode={`PLATE ${String(pIdx + 1).padStart(2, '0')}`}
                  aspectRatioLabel={photo.aspectRatioLabel}
                  showArchivalStamp={false}
                  mattePaddingClass="p-0"
                  className="shadow-2xl shadow-black/80"
                />
              </div>

              {/* Plate Technical Provenance: Location and Camera/Apparatus */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10 text-xs font-light tracking-tight text-neutral-400">
                <div>
                  <span className="text-neutral-500 block uppercase text-[10px] tracking-tight">TITLE</span>
                  <span className="text-white font-normal">{photo.title}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase text-[10px] tracking-tight">LOCATION</span>
                  <span className="text-neutral-300">{photo.location || 'SEOUL, KOREA'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase text-[10px] tracking-tight">CAMERA / FILM</span>
                  <span className="text-neutral-300">
                    {photo.filmStockOrCamera || '35mm Monochrom'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Back Action */}
        <div className="mt-32 pt-12 border-t border-white/10 flex justify-start items-center text-xs font-light tracking-tight text-neutral-400">
          <button
            onClick={onBack}
            className="hover:text-white uppercase tracking-tight bg-transparent border-0 p-0 cursor-pointer"
          >
            ← Return to Monographs
          </button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-8"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-6 right-8 text-xs font-light tracking-tight uppercase text-neutral-400 hover:text-white bg-transparent border-0 cursor-pointer"
          >
            [ Close Esc ]
          </button>

          <div
            className="w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <SpaceArchiveMatteImage
              src={selectedPhoto.imageUrl}
              alt={selectedPhoto.title}
              title={selectedPhoto.title}
              showArchivalStamp={false}
              mattePaddingClass="p-0"
              className="shadow-2xl shadow-black"
            />
            <div className="mt-4 flex justify-between text-xs font-light tracking-tight text-neutral-400">
              <span className="text-white">{selectedPhoto.title}</span>
              <span>{selectedPhoto.filmStockOrCamera}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
