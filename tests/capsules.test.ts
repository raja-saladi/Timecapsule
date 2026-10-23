import assert from "node:assert/strict";
import test from "node:test";
import { capsuleSchema, countdown, isUnlocked, localTimeToIso, validateMedia } from "../lib/capsules";

test("converts local time using quarter-hour time zones", () => {
  assert.equal(localTimeToIso("2030-01-01T10:30", "Asia/Kathmandu"), "2030-01-01T04:45:00.000Z");
});

test("rejects a local time that falls in a daylight-saving gap", () => {
  assert.equal(localTimeToIso("2024-03-10T02:30", "America/New_York"), null);
});

test("selects the earlier instant for an ambiguous daylight-saving time", () => {
  assert.equal(localTimeToIso("2024-11-03T01:30", "America/New_York"), "2024-11-03T05:30:00.000Z");
});

test("rejects invalid calendar dates and time zones", () => {
  assert.equal(localTimeToIso("2030-02-30T12:00", "UTC"), null);
  assert.equal(localTimeToIso("2030-01-01T12:00", "Mars/Olympus"), null);
});

test("capsule schema validates title, recipient email, and sharing mode", () => {
  const base = {
    title: "A note to future me",
    description: "",
    letter: "",
    unlockAt: "2030-01-01T12:00",
    timeZone: "UTC",
    visibility: "recipient",
    recipientName: "Future me",
    recipientEmail: "future@example.com",
  };
  assert.equal(capsuleSchema.safeParse(base).success, true);
  assert.equal(capsuleSchema.safeParse({ ...base, title: "x" }).success, false);
  assert.equal(capsuleSchema.safeParse({ ...base, recipientEmail: "not-an-email" }).success, false);
  assert.equal(capsuleSchema.safeParse({ ...base, visibility: "public" }).success, false);
});

test("enforces media count, type, per-file, and total size limits", () => {
  const file = (type: string, size: number) => ({ type, size }) as File;
  assert.equal(validateMedia([file("image/png", 1)]), null);
  assert.match(validateMedia([file("application/pdf", 1)]) ?? "", /Use JPG/);
  assert.match(validateMedia(Array.from({ length: 9 }, () => file("image/png", 1))) ?? "", /up to 8/);
  assert.match(validateMedia([file("video/mp4", 30 * 1024 * 1024 + 1)]) ?? "", /under 30 MB/);
  assert.match(validateMedia([file("image/png", 26 * 1024 * 1024), file("image/jpeg", 25 * 1024 * 1024)]) ?? "", /total upload/);
});

test("treats the unlock instant as open and formats near-term countdowns", () => {
  const unlock = "2030-01-01T00:00:00.000Z";
  const instant = Date.parse(unlock);
  assert.equal(isUnlocked(unlock, instant - 1), false);
  assert.equal(isUnlocked(unlock, instant), true);
  assert.equal(countdown(unlock, instant), "Ready to open");
  assert.equal(countdown(unlock, instant - 30_000), "Less than 1m remaining");
});