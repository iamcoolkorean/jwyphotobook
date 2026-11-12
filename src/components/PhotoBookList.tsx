import { PhotoBook } from '../types/photobook.ts';
import SpaceArchiveMatteImage from './SpaceArchiveMatteImage.tsx';

interface PhotoBookListProps {
  books: PhotoBook[];
  catalogDescription: string;
  isLoading?: boolean;
  onSelectBook: (book: PhotoBook) => void;
}

/**
 * Photo Book List Screen:
 * - Single column (1열) centered vertically long sequence.
 * - Header has title "Monograph Collections" and customizable catalogDescription.
 * - Under each photo: only Title and Comment appear (provenance/camera details appear on click).
 * - Bottom concludes with "END OF MONOGRAPH CATALOG".
 */
export default function PhotoBookList({
  books,
  catalogDescription,
  isLoading = false,
  onSelectBook,
}: PhotoBookListProps) {
  return (
    <div
      className="w-full bg-[#0A0A0A] text-white py-16 sm:py-24"
      data-testid="photobook-list-screen"
    >
      {/* Editorial Catalog Introduction */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 mb-20 sm:mb-28 text-left">
        <h2 className="text-3xl sm:text-4xl font-light tracking-tight text-white">
          Monograph Collections
        </h2>
        <p className="mt-4 text-neutral-400 text-sm sm:text-base leading-relaxed font-light text-left">
          {catalogDescription}
        </p>
      </div>

      {/* Single Column Series (1열 세로 배열) */}
      {isLoading && books.length === 0 ? (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-24">
          <div className="space-y-8 animate-pulse">
            {/* 1:1 Square Archival Skeleton Card */}
            <div className="w-full aspect-square bg-[#121212] border border-white/5 flex flex-col items-center justify-center p-8 select-none">
              <div className="w-7 h-7 border-2 border-neutral-700 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-xs font-light text-neutral-400 uppercase tracking-widest">
                [ LOADING ARCHIVE MONOGRAPHS... ]
              </p>
            </div>
            {/* Title & Comment Skeleton */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="h-6 bg-neutral-900 w-2/5" />
              <div className="h-4 bg-neutral-900/60 w-3/4" />
            </div>
          </div>
        </div>
      ) : books.length === 0 ? (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-24 text-center border border-white/5 bg-neutral-900/20">
          <p className="text-xs font-light text-neutral-400 uppercase tracking-widest">
            [ NO MONOGRAPHS CURRENTLY REGISTERED ]
          </p>
          <p className="mt-3 text-xs font-light text-neutral-500">
            Monographs will appear here once published from the Admin Console.
          </p>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-36 sm:space-y-48">
          {books.map((book) => (
            <article
              key={book.id}
              className="group cursor-pointer select-none"
              onClick={() => onSelectBook(book)}
            >
              {/* Space Archive 1:1 White Matting Frame */}
              <div className="relative transform transition-transform duration-500 ease-out group-hover:scale-[1.008]">
                <SpaceArchiveMatteImage
                  src={book.coverImage.imageUrl}
                  alt={book.coverImage.title}
                  title={book.title}
                  showArchivalStamp={false}
                  mattePaddingClass="p-0"
                  className="shadow-2xl shadow-black/90"
                />
              </div>

              {/* Directly beneath photo: Only Title and Comment */}
              <div className="mt-8 pt-4 border-t border-white/10 space-y-2">
                <h3 className="text-2xl sm:text-3xl font-light tracking-tight text-white group-hover:text-neutral-300 transition-colors">
                  {book.title}
              </h3>

              <p className="text-neutral-400 text-sm sm:text-base font-light leading-relaxed">
                {book.curatorNote || book.subtitle}
              </p>
            </div>
          </article>
        ))}
        </div>
      )}
    </div>
  );
}
