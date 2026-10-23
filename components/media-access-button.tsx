"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { getSignedMediaUrl } from "@/lib/api-client";

export function MediaAccessButton({ capsuleId, mediaId, fileName, mimeType, sizeBytes }: {
  capsuleId: string; mediaId: string; fileName: string; mimeType: string; sizeBytes: number;
}) {
  const [error, setError] = useState("");
  async function openMedia() {
    setError("");
    const tab = window.open("about:blank", "_blank");
    if (!tab) { setError("Allow pop-ups to open this private file."); return; }
    tab.opener = null;
    try {
      const url = await getSignedMediaUrl(capsuleId, mediaId);
      tab.location.href = url;
    } catch (cause) {
      tab.close();
      setError(cause instanceof Error ? cause.message : "Could not open this private file.");
    }
  }
  return <><button type="button" className="media-item" onClick={openMedia} style={{ font: "inherit", color: "inherit", textAlign: "left", width: "100%", cursor: "pointer" }}>
    <span>{mimeType.startsWith("video/") ? "Video" : "Photo"} - {Math.round(sizeBytes / 1024)} KB</span>
    <strong>{fileName}</strong>
    <span><Download size={11} style={{ display: "inline", marginRight: 5 }} />Open private file</span>
  </button>{error && <span role="alert" style={{ color: "#fca5a5", fontSize: 11 }}>{error}</span>}</>;
}
