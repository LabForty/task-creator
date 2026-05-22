"use client";

export function uploadDraftAttachment(args: {
  cloudId: string;
  issueKey: string;
  file: File;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jira/export-attachments");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && args.onProgress) {
        args.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `upload failed (${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (typeof parsed.error === "string") msg = parsed.error;
        } catch {
          /* not JSON, fine */
        }
        reject(new Error(msg));
      }
    };
    if (args.signal) args.signal.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("cloudId", args.cloudId);
    form.append("issueKey", args.issueKey);
    form.append("file", args.file);
    xhr.send(form);
  });
}
