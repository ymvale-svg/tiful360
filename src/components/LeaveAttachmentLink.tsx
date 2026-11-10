import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LEAVE_ATTACHMENTS_BUCKET, leaveAttachmentPath } from "@/lib/leaveAttachmentPath";

/** Signed URLs for sick notes are valid for 10 minutes only. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Opens a leave attachment in a new tab using a fresh short-lived signed URL.
 * The blank tab is opened synchronously (inside the click) so popup blockers
 * let it through; its location is set once the URL is signed.
 * Returns false when the file could not be opened.
 */
async function openLeaveAttachment(value: string | null | undefined): Promise<boolean> {
  const path = leaveAttachmentPath(value);
  if (!path) return false;
  const win = window.open("", "_blank");
  if (win) win.opener = null;
  const { data, error } = await supabase.storage
    .from(LEAVE_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    win?.close();
    return false;
  }
  if (win) win.location.href = data.signedUrl;
  else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  return true;
}

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  /** Value of leave_requests.attachment_url (object path, or a legacy signed URL). */
  value: string | null | undefined;
};

/**
 * Button that opens a leave attachment, signing the URL on click.
 * Renders nothing when the stored value isn't a usable path.
 * Forwards ref/props so it can be used under `<Button asChild>`.
 */
export const LeaveAttachmentLink = forwardRef<HTMLButtonElement, Props>(
  ({ value, children, ...rest }, ref) => {
    const { toast } = useToast();
    if (!leaveAttachmentPath(value)) return null;

    const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const ok = await openLeaveAttachment(value);
      if (!ok) toast({ title: "לא ניתן לפתוח את הקובץ", variant: "destructive" });
    };

    return (
      <button ref={ref} type="button" {...rest} onClick={onClick}>
        {children}
      </button>
    );
  },
);
LeaveAttachmentLink.displayName = "LeaveAttachmentLink";
