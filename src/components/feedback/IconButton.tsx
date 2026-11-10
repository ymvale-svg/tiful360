import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

interface IconButtonProps extends Omit<ButtonProps, "size" | "aria-label"> {
  /** Required: what the button does, read by screen readers and shown on hover ("מחק מסמך"). */
  label: string;
  size?: "icon" | "icon-touch";
}

/** An icon-only button that cannot be rendered without an accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "icon", variant = "ghost", title, ...props }, ref) => (
    <Button ref={ref} size={size} variant={variant} aria-label={label} title={title ?? label} {...props} />
  ),
);
IconButton.displayName = "IconButton";
