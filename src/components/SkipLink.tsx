/**
 * Accessible "skip to main content" link.
 * Hidden visually until focused via Tab — required by WCAG 2.4.1.
 * Target element should have id="main-content".
 */
export function SkipLink({ targetId = "main-content", label = "דלג לתוכן הראשי" }: { targetId?: string; label?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      {label}
    </a>
  );
}
