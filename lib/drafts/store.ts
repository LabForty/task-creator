import type { Draft } from "@/lib/draft/autosave";
import { getServiceClient } from "@/lib/supabase/server";
import {
  deriveWorkingTitle,
  derivePreview,
  type DraftListItem,
  type DraftDetail,
} from "./payload";

const TABLE = "drafts";

export class DraftStoreError extends Error {}

type Row = {
  id: string;
  owner_account_id: string;
  mode: string;
  working_title: string | null;
  payload: Partial<Draft>;
  created_at: string;
  updated_at: string;
};

function fail(error: unknown): never {
  throw new DraftStoreError(
    error instanceof Error ? error.message : String(error),
  );
}

export async function listDrafts(accountId: string): Promise<DraftListItem[]> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .select("id, working_title, mode, updated_at, payload")
    .eq("owner_account_id", accountId)
    .order("updated_at", { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    workingTitle: r.working_title || "Untitled draft",
    mode: r.mode,
    updatedAt: r.updated_at,
    preview: derivePreview(r.payload ?? {}),
  }));
}

export async function getDraft(
  accountId: string,
  id: string,
): Promise<DraftDetail | null> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .select("id, mode, working_title, updated_at, payload")
    .eq("owner_account_id", accountId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const r = data as Row;
  return {
    id: r.id,
    mode: r.mode,
    workingTitle: r.working_title || "Untitled draft",
    updatedAt: r.updated_at,
    payload: r.payload ?? {},
  };
}

export async function createDraft(
  accountId: string,
  payload: Partial<Draft>,
): Promise<string> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .insert({
      owner_account_id: accountId,
      mode: (payload as { mode?: string }).mode ?? "single",
      working_title: deriveWorkingTitle(payload),
      payload,
    })
    .select("id")
    .single();
  if (error) fail(error);
  return (data as { id: string }).id;
}

export async function updateDraft(
  accountId: string,
  id: string,
  payload: Partial<Draft>,
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .update({
      mode: (payload as { mode?: string }).mode ?? "single",
      working_title: deriveWorkingTitle(payload),
      payload,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_account_id", accountId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) fail(error);
  return Boolean(data);
}

export async function deleteDraft(
  accountId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .delete()
    .eq("owner_account_id", accountId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) fail(error);
  return Boolean(data);
}
