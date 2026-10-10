// Learner profile and progress. Lane A owns this file.
// Supabase (anonymous sign-in, no account needed) when VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set;
// otherwise, or when the network fails, this browser's localStorage, so the demo works offline.
// Tables and row-level security: supabase/migrations/0001_init.sql.
import { createClient } from "@supabase/supabase-js";
import type { AttemptRecord, Profile } from "@shared/contracts/types";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;

async function userId(): Promise<string> {
  const { data } = await supabase!.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signedIn, error } = await supabase!.auth.signInAnonymously();
  if (error || !signedIn.user) throw error ?? new Error("anonymous sign-in failed");
  return signedIn.user.id;
}

// shortcut: offline writes stay in this browser and are never synced up; fine for a demo laptop.
const local = {
  get<T>(k: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(`orbi.${k}`) ?? "null") ?? fallback; } catch { return fallback; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(`orbi.${k}`, JSON.stringify(v)); } catch { /* storage full or blocked */ }
  },
};

async function orLocal<T>(remote: () => Promise<T>, offline: () => T): Promise<T> {
  if (!supabase) return offline();
  try { return await remote(); } catch (e) { console.warn("Supabase unavailable, using local storage", e); return offline(); }
}

export const loadProfile = () => orLocal<Profile | null>(async () => {
  const { data, error } = await supabase!.from("profiles").select("l1, calibration").eq("id", await userId()).maybeSingle();
  if (error) throw error;
  return data && { l1: data.l1, calibration: data.calibration ?? undefined };
}, () => local.get<Profile | null>("profile", null));

export const saveProfile = (p: Profile) => orLocal(async () => {
  const { error } = await supabase!.from("profiles").upsert({ id: await userId(), l1: p.l1, calibration: p.calibration ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
  local.set("profile", p);
}, () => local.set("profile", p));

export const saveAttempt = (a: AttemptRecord) => orLocal(async () => {
  const { error } = await supabase!.from("attempts").insert({
    user_id: await userId(), prompt_id: a.promptId, passed: a.passed, score: a.score, issue_ids: a.issueIds, created_at: a.createdAt,
  });
  if (error) throw error;
}, () => local.set("attempts", [...local.get<AttemptRecord[]>("attempts", []), a]));

export const loadAttempts = () => orLocal<AttemptRecord[]>(async () => {
  const { data, error } = await supabase!.from("attempts").select("prompt_id, passed, score, issue_ids, created_at")
    .eq("user_id", await userId()).order("created_at");
  if (error) throw error;
  return data.map((r) => ({ promptId: r.prompt_id, passed: r.passed, score: r.score, issueIds: r.issue_ids, createdAt: r.created_at }));
}, () => local.get<AttemptRecord[]>("attempts", []));
