import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPreviewProps {
  src: string | null;
  title?: string;
  className?: string;
  height?: string;
}

export function PdfPreview({ src, title = "תצוגת הטופס", className, height = "70vh" }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";
    if (!src) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let activeRenderTask: pdfjs.RenderTask | null = null;
    const loadingTask = pdfjs.getDocument(src);
    setStatus("loading");

    (async () => {
      try {
        const pdf = await loadingTask.promise;
        const availableWidth = Math.max(container.clientWidth - 24, 280);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(availableWidth / baseViewport.width, 1.7);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.setAttribute("aria-label", `${title} עמוד ${pageNumber}`);

          const pageWrap = document.createElement("div");
          pageWrap.className = "mx-auto mb-4 w-fit overflow-hidden rounded-md border border-border bg-card shadow-sm last:mb-0";
          pageWrap.appendChild(canvas);
          container.appendChild(pageWrap);

          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("PDF canvas is unavailable");
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          activeRenderTask = page.render({ canvas, canvasContext: context, viewport });
          await activeRenderTask.promise;
          activeRenderTask = null;
        }

        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (!cancelled && (error as Error)?.name !== "RenderingCancelledException") {
          console.error("pdf preview render failed", error);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      activeRenderTask?.cancel();
      loadingTask.destroy();
      container.innerHTML = "";
    };
  }, [src, title]);

  return (
    <div className={cn("relative overflow-auto rounded-lg border bg-muted/30", className)} style={{ height }} aria-label={title}>
      <div ref={containerRef} className="min-h-full p-3" />
      {(status === "idle" || status === "loading") && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-12 text-center text-sm text-muted-foreground">
          טוען תצוגת טופס...
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background p-12 text-center text-sm text-destructive">
          לא ניתן להציג את הטופס. נסה לסגור ולפתוח מחדש.
        </div>
      )}
    </div>
  );
}