import { forwardRef, useImperativeHandle, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  getDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

interface Props {
  label?: string;
  height?: number;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ label = "חתימה", height = 160 }, ref) => {
    const sigRef = useRef<SignatureCanvas>(null);

    useImperativeHandle(ref, () => ({
      getDataUrl: () => {
        if (!sigRef.current || sigRef.current.isEmpty()) return null;
        return sigRef.current.getCanvas().toDataURL("image/png");
      },
      clear: () => sigRef.current?.clear(),
      isEmpty: () => sigRef.current?.isEmpty() ?? true,
    }));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{label}</label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => sigRef.current?.clear()}
          >
            <Eraser className="w-3 h-3" />
            נקה
          </Button>
        </div>
        <div
          className="bg-background border-2 border-dashed border-border rounded-lg overflow-hidden"
          style={{ height }}
        >
          <SignatureCanvas
            ref={sigRef}
            penColor="hsl(var(--foreground))"
            canvasProps={{
              className: "w-full h-full cursor-crosshair touch-none",
              style: { width: "100%", height: "100%" },
            }}
          />
        </div>
      </div>
    );
  },
);
SignaturePad.displayName = "SignaturePad";
