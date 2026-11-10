import { useEffect, useRef, useState } from "react";
import { useUploadJobCount } from "@/lib/floatingLayer";
import { cn } from "@/lib/utils";
import { Smartphone, X, Share, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    const days = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
    return days < DISMISS_DAYS;
  } catch {
    return false;
  }
}

interface InstallAppBannerProps {
  /** The page has a fixed bottom tab bar on phones (employee portal): sit above it. */
  aboveTabBar?: boolean;
}

export function InstallAppBanner({ aboveTabBar = false }: InstallAppBannerProps = {}) {
  const bannerRef = useRef<HTMLDivElement>(null);
  // Steps aside while the upload progress center (same corner, z-[100]) is showing jobs.
  const uploadsActive = useUploadJobCount() > 0;
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIOSDialog, setShowIOSDialog] = useState(false);
  const [showAndroidDialog, setShowAndroidDialog] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS doesn't fire beforeinstallprompt — show banner manually
    if (isIOS()) setShow(true);
    // Android browsers that don't fire the event (e.g. in-app browsers) — still surface manual instructions
    else if (isAndroid()) {
      const t = window.setTimeout(() => {
        setShow((prev) => prev || true);
      }, 1500);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        window.clearTimeout(t);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setShow(false);
      } else {
        dismiss();
      }
      setDeferred(null);
      return;
    }
    if (isIOS()) {
      setShowIOSDialog(true);
      return;
    }
    setShowAndroidDialog(true);
  };

  const visible = show && !uploadsActive;

  // Reserve room at the bottom of the page while the banner is up, so it never hides content.
  useEffect(() => {
    const el = bannerRef.current;
    if (!visible || !el) return;
    const prev = document.body.style.paddingBottom;
    const apply = () => {
      // Desktop shows a small corner card that doesn't span the content; only reserve on phones.
      const reserve = window.matchMedia("(min-width: 768px)").matches ? 0 : el.offsetHeight + 16;
      document.body.style.paddingBottom = reserve ? `${reserve}px` : prev;
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      document.body.style.paddingBottom = prev;
    };
  }, [visible]);

  if (!show) return null;

  return (
    <>
      {visible && (
      <div
        ref={bannerRef}
        role="region"
        aria-label="התקנת אפליקציה"
        className={cn(
          "fixed right-4 left-4 z-40 md:left-auto md:max-w-sm md:right-6",
          aboveTabBar
            ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
            : "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] md:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <div className="rounded-xl border border-border bg-card shadow-lg p-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">התקנת הפורטל בטלפון</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              גישה מהירה כמו אפליקציה — אייקון על המסך הראשי
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={handleInstall} className="gap-1.5 min-h-11">
                <Download className="h-4 w-4" />
                התקן
              </Button>
              <Button variant="ghost" onClick={dismiss} className="min-h-11">
                לא עכשיו
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="סגור את הודעת ההתקנה"
            className="-m-2 h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      )}

      {/* iOS install instructions */}
      <Dialog open={showIOSDialog} onOpenChange={setShowIOSDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספה למסך הבית (iPhone)</DialogTitle>
            <DialogDescription>פעולה חד-פעמית, לוקחת 10 שניות</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                1
              </span>
              <span className="flex items-center gap-1.5">
                לחץ על כפתור השיתוף <Share className="h-4 w-4 inline" /> בתחתית הדפדפן (Safari)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                2
              </span>
              <span className="flex items-center gap-1.5">
                גלול ובחר "הוסף למסך הבית" <Plus className="h-4 w-4 inline" />
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                3
              </span>
              <span>לחץ "הוסף" — האייקון יופיע על המסך הראשי כמו כל אפליקציה</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>

      {/* Android install instructions */}
      <Dialog open={showAndroidDialog} onOpenChange={setShowAndroidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הוספה למסך הבית (Android)</DialogTitle>
            <DialogDescription>פעולה חד-פעמית, לוקחת 10 שניות</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                1
              </span>
              <span>פתח את הפורטל ב-Chrome (לא בדפדפן של פייסבוק/וואטסאפ)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                2
              </span>
              <span>לחץ על תפריט שלוש הנקודות בפינה הימנית העליונה</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                3
              </span>
              <span>בחר "התקן אפליקציה" או "הוסף למסך הבית"</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                4
              </span>
              <span>אשר — האייקון יופיע על המסך הראשי כמו כל אפליקציה</span>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            טיפ: אם פתחת את הקישור מוואטסאפ, לחץ על "פתח בדפדפן" קודם.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
