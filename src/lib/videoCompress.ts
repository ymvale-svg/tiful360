/**
 * In-browser video re-encoding for protocol media.
 *
 * Phone clips (up to 60s) are re-recorded through a canvas with MediaRecorder
 * at a bitrate computed from the duration, so the result lands well under
 * VIDEO_MAX_BYTES. Audio is dropped and resolution is capped.
 * The hidden <video> is attached to the DOM with muted/playsinline attributes —
 * iOS Safari does not decode frames of a detached or non-inline video.
 */

export const VIDEO_TARGET_BYTES = 6 * 1024 * 1024; // aim ~6MB
export const VIDEO_MAX_BYTES = 10 * 1024 * 1024; // hard ceiling 10MB
const MAX_DIMENSION = 720;
const FPS = 24;

export interface CompressedVideo {
  blob: Blob;
  fileName: string;
  contentType: string;
  original: boolean;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? null;
}

const timeout = (ms: number, msg: string) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

async function encodeOnce(file: File, targetBytes: number, maxDim: number, onProgress?: (r: number) => void): Promise<{ blob: Blob; mimeType: string }> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("no recorder");
  const canvas = document.createElement("canvas");
  if (typeof (canvas as any).captureStream !== "function") throw new Error("no captureStream");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
  document.body.appendChild(video);
  let raf = 0;
  try {
    video.src = url;
    video.load();
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("metadata failed"));
      }),
      timeout(15000, "metadata timeout"),
    ]);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 60;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth || maxDim, video.videoHeight || maxDim));
    canvas.width = Math.max(2, Math.round(((video.videoWidth || maxDim) * scale) / 2) * 2);
    canvas.height = Math.max(2, Math.round(((video.videoHeight || maxDim) * scale) / 2) * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no ctx");

    const bitrate = Math.max(200_000, Math.min(2_500_000, Math.floor((targetBytes * 8 * 0.85) / duration)));
    const stream = (canvas as HTMLCanvasElement).captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
    });

    await Promise.race([video.play(), timeout(10000, "play timeout")]);
    recorder.start(1000);
    const draw = () => {
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress?.(Math.min(1, video.currentTime / duration));
      raf = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      setTimeout(resolve, duration * 1000 + 5000);
    });
    cancelAnimationFrame(raf);
    try { video.pause(); } catch { /* ignore */ }
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    const blob = await done;
    if (!blob.size) throw new Error("empty output");
    return { blob, mimeType };
  } finally {
    cancelAnimationFrame(raf);
    video.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * Compress a clip so it is always ≤ VIDEO_MAX_BYTES.
 * Throws a Hebrew error if the device cannot produce a small enough file.
 */
export async function compressVideo(
  file: File,
  targetBytes: number = VIDEO_TARGET_BYTES,
  onProgress?: (ratio: number) => void,
): Promise<CompressedVideo> {
  if (file.size <= VIDEO_MAX_BYTES) {
    return { blob: file, fileName: file.name, contentType: file.type || "video/mp4", original: true };
  }
  const attempts: Array<[number, number]> = [[targetBytes, MAX_DIMENSION], [targetBytes / 2, 480]];
  let lastErr: unknown = null;
  for (const [bytes, dim] of attempts) {
    try {
      const { blob, mimeType } = await encodeOnce(file, bytes, dim, onProgress);
      if (blob.size <= VIDEO_MAX_BYTES) {
        onProgress?.(1);
        const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
        const base = file.name.replace(/\.[^.]+$/, "") || "video";
        return { blob, fileName: `${base}-compressed.${ext}`, contentType: mimeType.split(";")[0], original: false };
      }
    } catch (e) {
      lastErr = e;
      console.warn("video compression attempt failed", e);
    }
  }
  console.warn("video compression failed", lastErr);
  throw new Error("לא הצלחנו לכווץ את הסרטון במכשיר הזה. צלמו סרטון קצר יותר (עד 60 שניות) ונסו שוב, או השאירו את המסך פתוח עד סיום הכיווץ.");
}
