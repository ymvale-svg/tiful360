import { useEffect, useRef, useState } from "react";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Crop, Loader2, Monitor, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function TicketScreenshotButton({ onAttach, disabled }: { onAttach: (file: File) => void; disabled?: boolean }) {
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState<PercentCrop>({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
  const imageRef = useRef<HTMLImageElement>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (image) URL.revokeObjectURL(image); }, [image]);

  const showImage = (blob: Blob) => {
    setCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
    setImage(URL.createObjectURL(blob));
  };

  const capture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.info("צילום מסך אינו זמין בדפדפן זה; ניתן לבחור תמונה לחיתוך");
      fallbackRef.current?.click();
      return;
    }
    setBusy(true);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) throw new Error("capture failed");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("capture failed");
      showImage(blob);
      video.srcObject = null;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
        toast.error("לא ניתן לצלם את המסך; ניתן לצרף צילום באמצעות בחירת קובץ");
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setBusy(false);
    }
  };

  const attach = async () => {
    const source = imageRef.current;
    if (!source || !crop.width || !crop.height) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.naturalWidth * crop.width / 100));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * crop.height / 100));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("crop failed");
      context.drawImage(source, source.naturalWidth * crop.x / 100, source.naturalHeight * crop.y / 100,
        source.naturalWidth * crop.width / 100, source.naturalHeight * crop.height / 100, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("crop failed");
      onAttach(new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" }));
      setImage(null);
      toast.success("צילום המסך צורף לקריאה");
    } catch {
      toast.error("לא ניתן לצרף את צילום המסך");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Button variant="outline" type="button" className="w-full gap-2" onClick={capture} disabled={disabled || busy}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Monitor className="w-4 h-4" aria-hidden="true" />}
      צילום מסך וחיתוך
    </Button>
    <input ref={fallbackRef} type="file" accept="image/*" className="sr-only" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) showImage(file);
      event.target.value = "";
    }} />
    <Dialog open={!!image} onOpenChange={(open) => { if (!open && !busy) setImage(null); }}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Crop className="w-5 h-5" />חיתוך צילום מסך</DialogTitle></DialogHeader>
        <div dir="ltr" className="flex justify-center">
          {image && <ReactCrop crop={crop} onChange={(_, percent) => setCrop(percent)}>
            <img ref={imageRef} src={image} alt="צילום מסך לחיתוך" className="max-h-[60vh] max-w-full object-contain" />
          </ReactCrop>}
        </div>
        <div className="flex gap-2">
          <Button type="button" className="gap-2" disabled={busy || !crop.width || !crop.height} onClick={attach}><Paperclip className="w-4 h-4" />צרף צילום</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setImage(null)}>ביטול</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}