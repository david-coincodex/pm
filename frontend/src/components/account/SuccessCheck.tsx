/**
 * A check mark that draws itself: the circle sweeps in, then the tick strokes on. Pure CSS via
 * two `animate-*` utilities declared in globals.css (the codebase's convention for keyframes),
 * so it costs no JavaScript and honours `prefers-reduced-motion` — with motion reduced both
 * animations are skipped and the mark simply appears.
 */
export default function SuccessCheck({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-14 w-14 text-emerald-500 ${className}`}
      viewBox="0 0 52 52"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle
        cx="26"
        cy="26"
        r="23"
        className="animate-check-circle motion-reduce:animate-none"
        pathLength={1}
      />
      <path
        d="M15 27 L23 35 L38 19"
        className="animate-check-mark motion-reduce:animate-none"
        pathLength={1}
      />
    </svg>
  );
}
