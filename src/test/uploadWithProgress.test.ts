import { describe, it, expect } from "vitest";
import { translateUploadError, uploadJobs } from "@/lib/uploadWithProgress";

describe("upload errors in Hebrew", () => {
  it("too large", () => expect(translateUploadError(413)).toBe("הקובץ גדול מדי"));
  it("no connection", () => expect(translateUploadError(0)).toContain("אין חיבור"));
  it("no permission", () => expect(translateUploadError(403)).toBe("אין הרשאה להעלות את הקובץ"));
});

describe("upload job stages", () => {
  it("moves from upload to done", () => {
    uploadJobs.add({ id: "a", name: "x.pdf", stage: "upload", percent: 40 });
    uploadJobs.update("a", { stage: "done", percent: 100 });
    expect(uploadJobs.get().find((j) => j.id === "a")?.stage).toBe("done");
    uploadJobs.remove("a");
    expect(uploadJobs.get()).toHaveLength(0);
  });
});
