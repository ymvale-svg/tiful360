import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, CircleAlert, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { saveActivity } from "@/lib/saveActivity";

const buttonVariants = cva(
  // Press feedback and 150ms colour transitions instead of instant state changes; while busy the
  // button keeps most of its contrast so the spinner stays readable, and its own leading icon
  // gives way to the spinner.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-busy:disabled:opacity-80 aria-busy:[&>svg:not([data-spinner])]:hidden data-[outcome]:[&>svg:not([data-spinner])]:hidden data-[outcome=success]:bg-success data-[outcome=success]:text-success-foreground data-[outcome=success]:border-success [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        // On touch screens every size grows to the 44px minimum target.
        default: "h-10 px-4 py-2 [@media(pointer:coarse)]:min-h-11",
        sm: "h-9 rounded-md px-3 [@media(pointer:coarse)]:min-h-11",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
        // Touch-sized targets for primary actions on mobile and dense rows.
        touch: "h-11 rounded-md px-4",
        "icon-touch": "h-11 w-11",
      },
    },
    compoundVariants: [
      // Inline text links keep their line height.
      { variant: "link", class: "[@media(pointer:coarse)]:min-h-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and blocks clicks. Async onClick handlers get this automatically. */
  loading?: boolean;
  /** Replaces the label while busy, e.g. "שומר...". */
  loadingText?: React.ReactNode;
  /**
   * Opt-in result feedback for an async onClick (after ddoemonn's "Loading Button" on 21st.dev):
   * when it resolves the label briefly turns into a check + this text, when it rejects into an
   * alert + errorText. Only use it where the handler really rejects on failure; a handler that
   * catches its own errors would otherwise show a false success.
   */
  successText?: React.ReactNode;
  errorText?: React.ReactNode;
}

type Outcome = "success" | "error" | null;
const OUTCOME_MS = 1600;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, loadingText, successText, errorText = "נכשל, נסו שוב", onClick, disabled, children, ...props }, ref) => {
    const [pending, setPending] = React.useState(false);
    const [outcome, setOutcome] = React.useState<Outcome>(null);
    const outcomeTimer = React.useRef<ReturnType<typeof setTimeout>>();
    React.useEffect(() => () => clearTimeout(outcomeTimer.current), []);
    const mounted = React.useRef(true);
    React.useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; };
    }, []);

    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...{ ...props, onClick, disabled }}>
          {children}
        </Slot>
      );
    }

    const busy = loading || pending;
    const iconOnly = size === "icon" || size === "icon-touch";

    // An onClick that returns a promise is a save: block repeat clicks until it settles and
    // report it to the global save bar.
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (busy) { e.preventDefault(); return; }
      const result = onClick?.(e) as unknown;
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        setPending(true);
        setOutcome(null);
        clearTimeout(outcomeTimer.current);
        const end = saveActivity.begin();
        const settle = (next: Outcome) => () => {
          end();
          if (!mounted.current) return;
          setPending(false);
          if (successText === undefined) return;
          setOutcome(next);
          outcomeTimer.current = setTimeout(() => { if (mounted.current) setOutcome(null); }, OUTCOME_MS);
        };
        (result as PromiseLike<unknown>).then(settle("success"), settle("error"));
      }
    };

    const button = (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        data-outcome={outcome ?? undefined}
        {...props}
      >
        {busy && <Loader2 data-spinner className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {outcome ? (
          // Same grid cell as the label, so the button keeps its width.
          <span className="grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
            <span className="invisible flex items-center gap-2" aria-hidden="true">{children}</span>
            <span
              key={outcome}
              className="flex items-center gap-1.5 animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none"
            >
              {outcome === "success" ? <Check data-spinner aria-hidden="true" /> : <CircleAlert data-spinner aria-hidden="true" />}
              {!iconOnly && (outcome === "success" ? successText : errorText)}
            </span>
          </span>
        ) : busy && iconOnly ? <span className="sr-only">{loadingText ?? "בטעינה"}</span> : busy && loadingText ? loadingText : children}
      </button>
    );
    // Announced outside the button so its accessible name stays the action, not the result.
    if (successText === undefined) return button;
    return (
      <>
        {button}
        <span className="sr-only" role="status" aria-live="polite">
          {outcome === "success" ? successText : outcome === "error" ? errorText : ""}
        </span>
      </>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
