"use client";

import { createClient } from "@/lib/supabase/client";
import { capsuleSchema, localTimeToIso, validateMedia } from "@/lib/capsules";

type ApiResult = { ok: boolean; message: string; id?: string };

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.NEXT_PUBLIC_RENDER_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("The Render API URL is not configured.");
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured. Add the project URL and publishable key.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in before continuing.");
  const response = await fetch(base + path, {
    ...init,
    headers: { Authorization: "Bearer " + session.access_token, ...(init.headers || {}) },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data as T;
}

export async function saveCapsule(form: FormData): Promise<ApiResult> {
  const raw = {
    title: String(form.get("title") || ""), description: String(form.get("description") || ""),
    letter: String(form.get("letter") || ""), unlockAt: String(form.get("unlockAt") || ""),
    timeZone: String(form.get("timeZone") || ""), visibility: String(form.get("visibility") || "private"),
    recipientName: String(form.get("recipientName") || ""), recipientEmail: String(form.get("recipientEmail") || ""),
  };
  const parsed = capsuleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Check the capsule details and try again." };
  if (parsed.data.visibility === "recipient" && !parsed.data.recipientEmail) return { ok: false, message: "Add the recipient email address to share this capsule." };
  const unlockAt = localTimeToIso(parsed.data.unlockAt, parsed.data.timeZone);
  if (!unlockAt) return { ok: false, message: "That local time is invalid or falls inside a daylight-saving time change. Choose another time." };
  if (Date.parse(unlockAt) <= Date.now() + 30000) return { ok: false, message: "Choose an unlock time at least 30 seconds in the future." };
  const files = form.getAll("media").filter((value): value is File => typeof value !== "string" && value.size > 0);
  const mediaError = validateMedia(files);
  if (mediaError) return { ok: false, message: mediaError };
  const id = String(form.get("id") || "");
  const body = { ...parsed.data, ...(id ? { removeMedia: form.getAll("removeMedia").filter((x) => typeof x === "string") } : {}) };
  let capsuleId = id;
  const uploadedIds: string[] = [];
  let message = "Changes saved.";
  try {
    if (!id) {
      const created = await apiRequest<ApiResult>("/api/capsules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      capsuleId = created.id || "";
      message = created.message || "Capsule sealed and saved.";
      if (!capsuleId) throw new Error("The capsule was saved, but the API did not return its ID.");
    }
    for (const file of files) {
      const uploaded = await apiRequest<{ id: string }>("/api/capsules/" + encodeURIComponent(capsuleId) + "/media", {
        method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file,
      });
      uploadedIds.push(uploaded.id);
    }
    if (id) {
      const updated = await apiRequest<ApiResult>("/api/capsules/" + encodeURIComponent(id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      message = updated.message || message;
    }
    return { ok: true, id: capsuleId, message };
  } catch (error) {
    await Promise.all(uploadedIds.map((mediaId) => apiRequest("/api/capsules/" + encodeURIComponent(capsuleId) + "/media/" + encodeURIComponent(mediaId), { method: "DELETE" }).catch(() => undefined)));
    if (!id && capsuleId) await apiRequest("/api/capsules/" + encodeURIComponent(capsuleId), { method: "DELETE" }).catch(() => undefined);
    return { ok: false, message: error instanceof Error ? error.message : "Capsule could not be saved. Please retry." };
  }
}

export async function deleteCapsule(id: string): Promise<ApiResult> {
  try { return await apiRequest<ApiResult>("/api/capsules/" + encodeURIComponent(id), { method: "DELETE" }); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not delete the capsule." }; }
}

export async function getSignedMediaUrl(id: string, mediaId: string): Promise<string> {
  const result = await apiRequest<{ url: string }>("/api/capsules/" + encodeURIComponent(id) + "/media/" + encodeURIComponent(mediaId));
  return result.url;
}
