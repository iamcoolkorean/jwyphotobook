/**
 * Site Footer:
 * Left logo deleted per user instructions.
 * Right: ORGANIZER: JWY · SEOUL, KOREA
 * Monochromatic #0A0A0A dark mode, zero-pill geometry.
 */
export default function Footer() {
  return (
    <footer
      className="w-full bg-[#0A0A0A] border-t border-white/10 px-6 sm:px-12 py-8 mt-auto text-neutral-400 font-light tracking-tight text-xs select-none"
      data-testid="site-footer"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-end">
        {/* Right: Organizer & Location */}
        <div className="flex items-center gap-3 text-[11px] tracking-wider uppercase text-neutral-400">
          <span className="text-neutral-300">ORGANIZER: JWY</span>
          <span className="text-neutral-600">·</span>
          <span>SEOUL, KOREA</span>
        </div>
      </div>
    </footer>
  );
}
