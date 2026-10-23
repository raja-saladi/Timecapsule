import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const port = Number(process.env.PORT || 10000);
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const bucket = "capsule-media";
const maxFile = 30 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm", "video/quicktime"]);
const schema = z.object({
  title: z.string().trim().min(2, "Add a title with at least 2 characters.").max(80),
  description: z.string().trim().max(300).optional().default(""),
  letter: z.string().max(20000).optional().default(""),
  unlockAt: z.string().min(1, "Choose an unlock date and time."),
  timeZone: z.string().min(1, "Choose a time zone."),
  visibility: z.enum(["private", "recipient"]),
  recipientName: z.string().trim().max(80).optional().default(""),
  recipientEmail: z.union([z.literal(""), z.string().email()]).optional().default(""),
});
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}
function fail(message, status = 500) { return Object.assign(new Error(message), { status }); }
function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = (process.env.FRONTEND_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Referrer-Policy", "no-referrer");
  return true;
}
async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(limit === maxFile ? "Each photo or video must be under 30 MB." : "Request is too large.", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  try { return JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8")); }
  catch (e) { if (e.status) throw e; throw fail("Send a valid JSON request.", 400); }
}
function localTimeToIso(local, zone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const wanted = match.slice(1).map(Number);
  try {
    const initial = Date.UTC(wanted[0], wanted[1] - 1, wanted[2], wanted[3], wanted[4]);
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const parts = (date) => {
      const p = Object.fromEntries(formatter.formatToParts(date).map((x) => [x.type, x.value]));
      return [Number(p.year), Number(p.month), Number(p.day), Number(p.hour), Number(p.minute)];
    };
    let best = null;
    for (let offset = -840; offset <= 840; offset += 15) {
      const date = new Date(initial - offset * 60000);
      if (parts(date).every((x, i) => x === wanted[i]) && (!best || date < best)) best = date;
    }
    return best?.toISOString() || null;
  } catch { return null; }
}
function validated(input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw fail(parsed.error.issues[0]?.message || "Check the capsule details.", 400);
  const v = parsed.data;
  if (v.visibility === "recipient" && !v.recipientEmail) throw fail("Add the recipient email address to share this capsule.", 400);
  const unlock = localTimeToIso(v.unlockAt, v.timeZone);
  if (!unlock) throw fail("That local time is invalid or falls inside a daylight-saving time change. Choose another time.", 400);
  if (Date.parse(unlock) <= Date.now() + 30000) throw fail("Choose an unlock time at least 30 seconds in the future.", 400);
  return { v, details: { title: v.title, description: v.description || null, unlock_at: unlock, time_zone: v.timeZone, visibility: v.visibility, recipient_name: v.recipientName || null } };
}
async function setRecipients(db, id, visibility, email) {
  const deleted = await db.from("capsule_recipients").delete().eq("capsule_id", id);
  if (deleted.error) return deleted.error.message;
  if (visibility === "recipient" && email) {
    const inserted = await db.from("capsule_recipients").insert({ capsule_id: id, recipient_email: email.toLowerCase() });
    if (inserted.error) return inserted.error.message;
  }
  return null;
}
async function restore(db, id, old, letter, oldRecipients) {
  await db.from("capsules").update({ title: old.title, description: old.description, unlock_at: old.unlock_at, time_zone: old.time_zone, visibility: old.visibility, recipient_name: old.recipient_name }).eq("id", id);
  await db.from("capsule_contents").upsert({ capsule_id: id, letter });
  await db.from("capsule_recipients").delete().eq("capsule_id", id);
  if (oldRecipients.length) await db.from("capsule_recipients").insert(oldRecipients.map((x) => ({ capsule_id: id, recipient_email: x.recipient_email })));
}
async function destroyCapsule(db, id, userId) {
  const rows = await db.from("capsule_media").select("storage_key").eq("capsule_id", id);
  if (rows.error) throw fail("Could not check capsule files: " + rows.error.message);
  const paths = (rows.data || []).map((x) => x.storage_key);
  if (paths.length) {
    const removed = await db.storage.from(bucket).remove(paths);
    if (removed.error) throw fail("Capsule was not deleted because its private files could not be removed: " + removed.error.message);
  }
  const deleted = await db.from("capsules").delete().eq("id", id).eq("user_id", userId);
  if (deleted.error) throw fail("Could not delete the capsule: " + deleted.error.message);
}

async function handle(req, res) {
  if (!cors(req, res)) return send(res, 403, { error: "This website is not allowed to call the API." });
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const path = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "GET" && path === "/health") return send(res, 200, { status: "ok" });
  if (!supabaseUrl || !publishableKey) return send(res, 503, { error: "The API is not configured with Supabase yet." });
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token) return send(res, 401, { error: "Sign in required." });
  const db = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: "Bearer " + token } } });
  const auth = await db.auth.getUser(token);
  if (auth.error || !auth.data.user) return send(res, 401, { error: "Your session has expired. Please sign in again." });
  const user = auth.data.user;
  const capsuleRoute = /^\/api\/capsules(?:\/([0-9a-f-]+))?$/i.exec(path);
  const mediaRoute = /^\/api\/capsules\/([0-9a-f-]+)\/media(?:\/([0-9a-f-]+))?$/i.exec(path);

  if (req.method === "POST" && capsuleRoute && !capsuleRoute[1]) {
    const { v, details } = validated(await readJson(req));
    const inserted = await db.from("capsules").insert({ ...details, user_id: user.id }).select("id").single();
    if (inserted.error || !inserted.data) return send(res, 502, { error: "Capsule not saved: " + (inserted.error?.message || "Apply the Supabase migration first.") });
    const id = inserted.data.id;
    const content = await db.from("capsule_contents").upsert({ capsule_id: id, letter: v.letter.trim() || null });
    if (content.error) { await db.from("capsules").delete().eq("id", id); return send(res, 502, { error: "Capsule content was not saved: " + content.error.message }); }
    const recipientError = await setRecipients(db, id, v.visibility, v.recipientEmail);
    if (recipientError) { await db.from("capsules").delete().eq("id", id); return send(res, 502, { error: "Recipient access could not be updated: " + recipientError }); }
    return send(res, 201, { ok: true, id, message: "Capsule sealed and saved." });
  }
  if (req.method === "PUT" && capsuleRoute?.[1]) {
    const id = capsuleRoute[1], input = await readJson(req);
    const removeIds = Array.isArray(input.removeMedia) ? input.removeMedia.filter((x) => typeof x === "string") : [];
    const { v, details } = validated(input);
    const found = await db.from("capsules").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (found.error || !found.data) return send(res, 404, { error: "This capsule is unavailable or no longer eligible for editing." });
    const old = found.data;
    if (Date.parse(old.unlock_at) <= Date.now()) return send(res, 403, { error: "This capsule has already opened and can no longer be edited." });
    const [oldContent, oldRecipients, oldMedia] = await Promise.all([
      db.from("capsule_contents").select("letter").eq("capsule_id", id).maybeSingle(),
      db.from("capsule_recipients").select("recipient_email").eq("capsule_id", id),
      removeIds.length ? db.from("capsule_media").select("id,storage_key").eq("capsule_id", id).in("id", removeIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (oldContent.error || oldRecipients.error || oldMedia.error) return send(res, 502, { error: "Could not load the current capsule details. Nothing was changed." });
    const changed = await db.from("capsules").update(details).eq("id", id).eq("user_id", user.id);
    if (changed.error) return send(res, 502, { error: "Capsule not saved: " + changed.error.message });
    const newContent = await db.from("capsule_contents").upsert({ capsule_id: id, letter: v.letter.trim() || null });
    if (newContent.error) { await restore(db, id, old, oldContent.data?.letter ?? null, oldRecipients.data || []); return send(res, 502, { error: "Capsule content was not saved: " + newContent.error.message }); }
    const recipientError = await setRecipients(db, id, v.visibility, v.recipientEmail);
    if (recipientError) { await restore(db, id, old, oldContent.data?.letter ?? null, oldRecipients.data || []); return send(res, 502, { error: "Recipient access could not be updated: " + recipientError }); }
    let message = "Changes saved.";
    if (oldMedia.data?.length) {
      const removed = await db.storage.from(bucket).remove(oldMedia.data.map((x) => x.storage_key));
      if (removed.error) message = "Capsule saved, but one or more selected files could not be removed. Try removing them again from edit.";
      else {
        const deleted = await db.from("capsule_media").delete().in("id", oldMedia.data.map((x) => x.id));
        if (deleted.error) message = "Capsule saved, but one or more removed-file records could not be cleared.";
      }
    }
    return send(res, 200, { ok: true, id, message });
  }
  if (req.method === "DELETE" && capsuleRoute?.[1] && !mediaRoute) {
    const id = capsuleRoute[1];
    const cap = await db.from("capsules").select("id,unlock_at").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (cap.error || !cap.data) return send(res, 404, { error: "Capsule not found." });
    if (Date.parse(cap.data.unlock_at) <= Date.now()) return send(res, 403, { error: "Opened capsules can no longer be deleted." });
    await destroyCapsule(db, id, user.id);
    return send(res, 200, { ok: true, message: "Capsule deleted." });
  }
  if (mediaRoute && req.method === "POST" && !mediaRoute[2]) {
    const id = mediaRoute[1], type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!types.has(type)) return send(res, 415, { error: "Use JPG, PNG, WebP, AVIF, MP4, WebM, or MOV files." });
    if (Number(req.headers["content-length"] || 0) > maxFile) return send(res, 413, { error: "Each photo or video must be under 30 MB." });
    const cap = await db.from("capsules").select("id,unlock_at").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (cap.error || !cap.data) return send(res, 404, { error: "Capsule not found." });
    if (Date.parse(cap.data.unlock_at) <= Date.now()) return send(res, 403, { error: "Opened capsules can no longer be edited." });
    const bytes = await readBody(req, maxFile);
    if (!bytes.length) return send(res, 400, { error: "The selected file is empty." });
    let name = "upload";
    try { if (req.headers["x-file-name"]) name = decodeURIComponent(String(req.headers["x-file-name"])); }
    catch { return send(res, 400, { error: "The file name is invalid." }); }
    name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "upload";
    const safe = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "upload";
    const storageKey = user.id + "/" + id + "/" + crypto.randomUUID() + "-" + safe;
    const uploaded = await db.storage.from(bucket).upload(storageKey, bytes, { contentType: type, upsert: false });
    if (uploaded.error) return send(res, 502, { error: "Could not upload " + name + ": " + uploaded.error.message });
    const saved = await db.from("capsule_media").insert({ capsule_id: id, owner_id: user.id, storage_key: storageKey, file_name: name, mime_type: type, size_bytes: bytes.length }).select("id").single();
    if (saved.error || !saved.data) {
      await db.storage.from(bucket).remove([storageKey]);
      return send(res, 502, { error: "Media metadata could not be stored: " + (saved.error?.message || "unknown error") });
    }
    return send(res, 201, { ok: true, id: saved.data.id });
  }
  if (mediaRoute && req.method === "DELETE" && mediaRoute[2]) {
    const id = mediaRoute[1], mediaId = mediaRoute[2];
    const row = await db.from("capsule_media").select("id,storage_key").eq("id", mediaId).eq("capsule_id", id).eq("owner_id", user.id).maybeSingle();
    if (row.error || !row.data) return send(res, 404, { error: "Media not found." });
    const cap = await db.from("capsules").select("id,unlock_at").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (cap.error || !cap.data || Date.parse(cap.data.unlock_at) <= Date.now()) return send(res, 403, { error: "This capsule can no longer be edited." });
    const removed = await db.storage.from(bucket).remove([row.data.storage_key]);
    if (removed.error) return send(res, 502, { error: "Could not remove the uploaded file: " + removed.error.message });
    const deleted = await db.from("capsule_media").delete().eq("id", mediaId).eq("capsule_id", id);
    if (deleted.error) return send(res, 502, { error: "The uploaded file was removed, but its metadata could not be cleared." });
    return send(res, 200, { ok: true });
  }
  if (mediaRoute && req.method === "GET" && mediaRoute[2]) {
    const id = mediaRoute[1], mediaId = mediaRoute[2];
    const cap = await db.from("capsules").select("id,unlock_at").eq("id", id).maybeSingle();
    if (cap.error || !cap.data) return send(res, 404, { error: "Capsule not found." });
    if (Date.parse(cap.data.unlock_at) > Date.now()) return send(res, 403, { error: "This capsule is still sealed." });
    const media = await db.from("capsule_media").select("storage_key").eq("id", mediaId).eq("capsule_id", id).maybeSingle();
    if (media.error || !media.data) return send(res, 404, { error: "Media not found." });
    const signed = await db.storage.from(bucket).createSignedUrl(media.data.storage_key, 60);
    if (signed.error || !signed.data) return send(res, 403, { error: "Could not open this private file." });
    return send(res, 200, { url: signed.data.signedUrl });
  }
  return send(res, 404, { error: "API route not found." });
}
createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (!res.headersSent) send(res, e.status || 500, { error: e.message || "The request could not be completed." });
    else res.destroy(e);
  });
}).listen(port, "0.0.0.0", () => console.log("Time Capsule API listening on " + port));
