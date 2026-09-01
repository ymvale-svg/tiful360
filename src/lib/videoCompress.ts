/**
 * In-browser video re-encoding for protocol media.
 *
 * Phone clips are often 20-80MB, which times out the storage upload. We replay
 * the clip into a canvas and re-record it with MediaRecorder at a bitrate
 * calculated from the clip duration so the result lands around 3MB.
 * Audio is dropped (documentation clips don't need it) and resolution is
 * capped at 720px on the long edge.
 */

export const VIDEO_TARGET_BYTES = 3 * 1024 * 1024; // 3MB
const MAX_DIMENSION = 720;
const FPS = 24;

export interface CompressedVideo {
  blob: Blob;
  fileName: string;
  contentType: string;
  /** true when the original was returned untouched (unsupported browser / already small). */
  original: boolean;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? null;
}

export async function compressVideo(
  file: File,
  targetBytes: number = VIDEO_TARGET_BYTES,
  onProgress?: (ratio: number) => void,
): Promise<CompressedVideo> {
  const asIs: CompressedVideo = {
    blob: file,
    fileName: file.name,
    contentType: file.type || "video/mp4",
    original: true,
  };
  if (!file.type.startsWith("video/") || file.size <= targetBytes) return asIs;

  const mimeType = pickMimeType();
  const video = document.createElement("video");
  if (!mimeType || typeof (document.createElement("canvas") as any).captureStream !== "function") return asIs;

  const url = URL.createObjectURL(file);
  try {
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video metadata load failed"));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) return asIs;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    canvas.height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return asIs;

    // 90% of the budget leaves room for container overhead.
    const bitrate = Math.max(250_000, Math.min(3_000_000, Math.floor((targetBytes * 8 * 0.9) / duration)));
    const stream = (canvas as HTMLCanvasElement).captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    recorder.start(1000);
    await video.play();

    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress?.(Math.min(1, video.currentTime / duration));
      raf = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      // Safety net: never hang longer than the clip + 5s.
      setTimeout(resolve, duration * 1000 + 5000);
    });

    cancelAnimationFrame(raf);
    try { video.pause(); } catch { /* ignore */ }
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());

    const blob = await done;
    onProgress?.(1);
    if (!blob.size || blob.size >= file.size) return asIs;

    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    return {
      blob,
      fileName: `${base}-compressed.${ext}`,
      contentType: mimeType.split(";")[0],
      original: false,
    };
  } catch (e) {
    console.warn("video compression failed, uploading original", e);
    return asIs;
  } finally {
    URL.revokeObjectURL(url);
  }
}
