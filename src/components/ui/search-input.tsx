// The site's one search field, adapted from "Beam Search Bar" (arihantcodes, Spectrum UI) on 21st.dev:
// a leading icon, a clear button once there is text, Escape to clear, an optional trailing hint, and a
// light that runs along the bottom edge while the field has focus. The beam is plain CSS in the
// primary token (no border-beam dependency) and stays still under reduced motion.
import { forwardRef, useRef, useImperativeHandle, type InputHTMLAttributes, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size" | "type"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name; also the placeholder when none is given. */
  label: string;
  /** "sm" for dialogs and side panels, "md" for page toolbars. */
  size?: "sm" | "md";
  /** Shown at the end while the field is empty, e.g. a keyboard hint. */
  trailing?: ReactNode;
  wrapperClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, label, size = "md", trailing, wrapperClassName, className, placeholder, onKeyDown, ...props },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);

  return (
    <div
      className={cn(
        "group/search relative flex w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-card px-3 shadow-sm transition-[border-color,box-shadow]",
        "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15",
        size === "md" ? "min-h-11" : "min-h-10",
        wrapperClassName,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within/search:text-primary" aria-hidden="true" />
      <input
        ref={inner}
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder ?? label}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          // Escape clears first; with an empty field it is left for the dialog or page around it.
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onValueChange("");
          }
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground/80 sm:text-sm [&::-webkit-search-cancel-button]:hidden",
          className,
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="ניקוי החיפוש"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onValueChange(""); inner.current?.focus(); }}
          className="-me-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        trailing
      )}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden opacity-0 transition-opacity duration-300 group-focus-within/search:opacity-100">
        <span className="absolute inset-y-0 right-0 w-2/5 animate-beam bg-gradient-to-r from-transparent via-primary to-transparent motion-reduce:w-full motion-reduce:animate-none motion-reduce:via-primary/60" />
      </span>
    </div>
  );
});
