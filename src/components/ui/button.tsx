import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { saveActivity } from "@/lib/saveActivity";

const buttonVariants = cva(
  // Press feedback and 150ms colour transitions instead of instant state changes; while busy the
  // button keeps most of its contrast so the spinner stays readable, and its own leading icon
  // gives way to the spinner.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-busy:disabled:opacity-80 aria-busy:[&>svg:not([data-spinner])]:hidden [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, loadingText, onClick, disabled, children, ...props }, ref) => {
    const [pending, setPending] = React.useState(false);
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
        const end = saveActivity.begin();
        const settle = () => { end(); if (mounted.current) setPending(false); };
        (result as PromiseLike<unknown>).then(settle, settle);
      }
    };

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...props}
      >
        {busy && <Loader2 data-spinner className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {busy && iconOnly ? <span className="sr-only">{loadingText ?? "בטעינה"}</span> : busy && loadingText ? loadingText : children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
