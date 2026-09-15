import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, ExternalLink, MessageCircle, Mail } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: string[];
  employeeName?: string;
  /** null = not attempted, true = sent, false = no email / send failed */
  emailSent: boolean | null;
}

/** Shows the direct remote-signing link(s) so the sender can share them independently. */
export function SignLinkDialog({ open, onOpenChange, links, employeeName, emailSent }: Props) {
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (url: string, i: number) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>הטופס נשלח לחתימה</DialogTitle>
          <DialogDescription>
            {emailSent === true
              ? `נשלח מייל ל${employeeName || "עובד"} עם קישור לחתימה דיגיטלית.`
              : emailSent === false
                ? "לא נמצאה כתובת מייל לעובד או שהשליחה נכשלה — אפשר לשלוח את הקישור באופן עצמאי."
                : "אפשר לשלוח את הקישור לחתימה באופן עצמאי."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {links.map((url, i) => (
            <div key={url} className="space-y-2">
              {links.length > 1 && <div className="text-xs text-muted-foreground">טופס {i + 1}</div>}
              <div className="flex gap-2">
                <Input readOnly value={url} dir="ltr" className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" size="icon" onClick={() => copy(url, i)}>
                  {copied === i ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(`טופס לחתימה דיגיטלית: ${url}`)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <MessageCircle className="w-4 h-4 ml-1" /> שליחה בוואטסאפ
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    (window.location.href = `mailto:?subject=${encodeURIComponent("טופס לחתימה דיגיטלית")}&body=${encodeURIComponent(url)}`)
                  }
                >
                  <Mail className="w-4 h-4 ml-1" /> שליחה במייל
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="w-4 h-4 ml-1" /> פתיחת הטופס
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          החתימה מתבצעת רק לאחר כניסת העובד לאזור האישי בפורטל.
        </p>

        <div className="flex justify-start pt-2">
          <Button onClick={() => onOpenChange(false)}>סגירה</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
