import { Capacitor } from "@capacitor/core";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
  type User
} from "@supabase/supabase-js";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

export const ADMIN_EMAIL = "xuanduy.cn@gmail.com";
export const AUDIO_BUCKET = "dino-audio";
export const MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;
export type AudioKind = "music" | "book";
export type AudioCollection = "sleep" | "relax" | "fairytale";
export type CuratedAudioListKind = "music_album" | "book_album" | "music_chart" | "book_chart";

export type SharedAudioItem = {
  id: string;
  title: string;
  creator: string;
  kind: AudioKind;
  artwork: string;
  collections: AudioCollection[];
  playCount: number;
  storagePath: string;
  createdBy: string;
};

export type CuratedAudioList = {
  id: string;
  title: string;
  description: string;
  kind: CuratedAudioListKind;
  itemIds: string[];
  createdAt: string;
};

export type AudioItemUserState = {
  audioItemId: string;
  liked: boolean;
  saved: boolean;
};

export type AudioPlaylist = {
  id: string;
  title: string;
  description: string;
  itemIds: string[];
};

export type AudioOwnerProfile = {
  displayName: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(
  supabaseUrl?.startsWith("https://")
  && supabaseUrl.endsWith(".supabase.co")
  && supabaseAnonKey
  && !supabaseAnonKey.startsWith("your-")
);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  : null;

export function listenToAuth(
  onUser: (user: User | null) => void,
  onError: (error: Error) => void
) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onUser(session?.user ?? null);
  });
  void supabase.auth.getSession().then(({ data: sessionData, error }) => {
    if (error) {
      onError(error);
      return;
    }
    onUser(sessionData.session?.user ?? null);
  }).catch(onError);
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");

  if (!Capacitor.isNativePlatform()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
    return;
  }

  const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error("Google không trả về thông tin xác thực.");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function listenToSharedAudio(
  onItems: (items: (SharedAudioItem & { createdAt: string; owner: AudioOwnerProfile | null })[]) => void,
  onError: (error: Error) => void
) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  let active = true;
  let channel: RealtimeChannel;
  let loadTimeout: ReturnType<typeof setTimeout> | undefined;
  let isLoadingItems = false;
  let reloadPending = false;

  const loadItems = async () => {
    if (isLoadingItems) {
      reloadPending = true;
      return;
    }

    isLoadingItems = true;
    try {
      const { data, error } = await supabase
        .from("audio_items")
        .select("id, title, creator, kind, artwork, collections, play_count, storage_path, created_by, created_at")
        .order("created_at", { ascending: false });

      if (!active) return;
      if (error) {
        onError(error);
        return;
      }

      const audioItems = data ?? [];
      const ownerIds = Array.from(new Set(audioItems.map((item) => item.created_by)));
      const { data: profiles, error: profilesError } = ownerIds.length
        ? await supabase
          .from("dino_public_profiles")
          .select("user_id, display_name")
          .in("user_id", ownerIds)
        : { data: [], error: null };
      if (!active) return;
      if (profilesError) {
        onError(profilesError);
        return;
      }

      const profilesByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      onItems(audioItems.map((item) => {
        const ownerProfile = profilesByUserId.get(item.created_by);
        return {
          id: item.id,
          title: item.title,
          creator: item.creator,
          kind: item.kind as AudioKind,
          artwork: item.artwork,
          collections: item.collections as AudioCollection[],
          playCount: Number(item.play_count),
          storagePath: item.storage_path,
          createdBy: item.created_by,
          createdAt: item.created_at,
          owner: ownerProfile ? { displayName: ownerProfile.display_name } : null
        };
      }));
    } finally {
      isLoadingItems = false;
      if (active && reloadPending) {
        reloadPending = false;
        scheduleItemsReload();
      }
    }
  };

  const scheduleItemsReload = () => {
    if (loadTimeout) clearTimeout(loadTimeout);
    loadTimeout = setTimeout(() => {
      loadTimeout = undefined;
      void loadItems().catch(onError);
    }, 100);
  };

  void loadItems().catch(onError);
  channel = supabase
    .channel("dino-audio-library")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "audio_items"
    }, scheduleItemsReload)
    .subscribe((status, error) => {
      if (active && status === "CHANNEL_ERROR") {
        onError(error ?? new Error("Không thể kết nối đồng bộ realtime."));
      }
    });

  return () => {
    active = false;
    if (loadTimeout) clearTimeout(loadTimeout);
    void supabase.removeChannel(channel);
  };
}

export function listenToCuratedAudioLists(
  onLists: (lists: CuratedAudioList[]) => void,
  onError: (error: Error) => void
) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  let active = true;

  const loadLists = async () => {
    const { data: lists, error: listsError } = await supabase
      .from("curated_audio_lists")
      .select("id, title, description, kind, created_at")
      .order("created_at", { ascending: false });

    if (listsError) throw listsError;
    if (!active) return;

    const { data: listItems, error: itemsError } = lists?.length
      ? await supabase
        .from("curated_audio_list_items")
        .select("audio_list_id, audio_item_id, position")
        .in("audio_list_id", lists.map((list) => list.id))
        .order("position", { ascending: true })
      : { data: [], error: null };

    if (itemsError) throw itemsError;
    if (!active) return;

    const itemIdsByList = new Map<string, string[]>();
    for (const entry of listItems ?? []) {
      const itemIds = itemIdsByList.get(entry.audio_list_id) ?? [];
      itemIds.push(entry.audio_item_id);
      itemIdsByList.set(entry.audio_list_id, itemIds);
    }

    onLists((lists ?? []).map((list) => ({
      id: list.id,
      title: list.title,
      description: list.description,
      kind: list.kind as CuratedAudioListKind,
      itemIds: itemIdsByList.get(list.id) ?? [],
      createdAt: list.created_at
    })));
  };

  void loadLists().catch(onError);
  const channel = supabase
    .channel("dino-curated-audio-lists")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "curated_audio_lists"
    }, () => {
      void loadLists().catch(onError);
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "curated_audio_list_items"
    }, () => {
      void loadLists().catch(onError);
    })
    .subscribe((status, error) => {
      if (active && status === "CHANNEL_ERROR") {
        onError(error ?? new Error("Không thể đồng bộ album và bảng xếp hạng."));
      }
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function createCuratedAudioList(input: {
  title: string;
  description: string;
  kind: CuratedAudioListKind;
  itemIds: string[];
}) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.rpc("create_dino_audio_list", {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_kind: input.kind,
    p_audio_item_ids: input.itemIds
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("Không nhận được xác nhận tạo album hoặc bảng xếp hạng.");
  }
  return data;
}

export function listenToMyAudioItemStates(
  userId: string,
  onStates: (states: AudioItemUserState[]) => void,
  onError: (error: Error) => void
) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  let active = true;
  const loadStates = async () => {
    const { data, error } = await supabase
      .from("audio_item_user_states")
      .select("audio_item_id, liked, saved")
      .eq("user_id", userId);
    if (!active) return;
    if (error) {
      onError(error);
      return;
    }
    onStates((data ?? []).map((state) => ({
      audioItemId: state.audio_item_id,
      liked: state.liked,
      saved: state.saved
    })));
  };

  void loadStates().catch(onError);
  const channel = supabase
    .channel(`dino-audio-state-${userId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "audio_item_user_states",
      filter: `user_id=eq.${userId}`
    }, () => {
      void loadStates().catch(onError);
    })
    .subscribe((status, error) => {
      if (active && status === "CHANNEL_ERROR") {
        onError(error ?? new Error("Không thể đồng bộ thư viện cá nhân."));
      }
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function setAudioItemUserState(
  itemId: string,
  action: "liked" | "saved",
  enabled: boolean
) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { error } = await supabase.rpc("set_dino_audio_item_state", {
    p_audio_item_id: itemId,
    p_action: action,
    p_enabled: enabled
  });
  if (error) throw error;
}

export async function loadMyAudioPlaylists(): Promise<AudioPlaylist[]> {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data: playlists, error: playlistsError } = await supabase
    .from("audio_playlists")
    .select("id, title, description")
    .order("created_at", { ascending: false });
  if (playlistsError) throw playlistsError;

  const playlistRows = playlists ?? [];
  const { data: entries, error: entriesError } = playlistRows.length
    ? await supabase
      .from("audio_playlist_items")
      .select("playlist_id, audio_item_id, position")
      .in("playlist_id", playlistRows.map((playlist) => playlist.id))
      .order("position", { ascending: true })
    : { data: [], error: null };
  if (entriesError) throw entriesError;

  const itemIdsByPlaylist = new Map<string, string[]>();
  for (const entry of entries ?? []) {
    const itemIds = itemIdsByPlaylist.get(entry.playlist_id) ?? [];
    itemIds.push(entry.audio_item_id);
    itemIdsByPlaylist.set(entry.playlist_id, itemIds);
  }
  return playlistRows.map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    itemIds: itemIdsByPlaylist.get(playlist.id) ?? []
  }));
}

export function listenToMyAudioPlaylists(
  userId: string,
  onPlaylists: (playlists: AudioPlaylist[]) => void,
  onError: (error: Error) => void
) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  let active = true;
  const loadPlaylists = async () => {
    try {
      const playlists = await loadMyAudioPlaylists();
      if (active) onPlaylists(playlists);
    } catch (error) {
      if (active) onError(error instanceof Error ? error : new Error("Không thể tải danh sách phát."));
    }
  };

  void loadPlaylists();
  const channel = supabase
    .channel(`dino-playlists-${userId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "audio_playlists",
      filter: `user_id=eq.${userId}`
    }, () => {
      void loadPlaylists();
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "audio_playlist_items"
    }, () => {
      void loadPlaylists();
    })
    .subscribe((status, error) => {
      if (active && status === "CHANNEL_ERROR") {
        onError(error ?? new Error("Không thể đồng bộ danh sách phát."));
      }
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function addAudioItemToPlaylist(input: {
  audioItemId: string;
  playlistId?: string;
  newPlaylistTitle?: string;
}) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.rpc("add_dino_audio_item_to_playlist", {
    p_audio_item_id: input.audioItemId,
    p_playlist_id: input.playlistId ?? null,
    p_new_playlist_title: input.newPlaylistTitle?.trim() || null
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("Không nhận được xác nhận cập nhật danh sách phát.");
  }
  return data;
}

export async function addSharedAudio(
  file: File,
  metadata: { title: string; creator: string; kind: AudioKind; collections: AudioCollection[] },
  user: User
) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  if (user.email?.toLowerCase() !== ADMIN_EMAIL) {
    throw new Error("Chỉ quản trị viên mới có thể thêm nhạc hoặc sách vào kho chung.");
  }
  if (!file.type.startsWith("audio/")) throw new Error("Hãy chọn một tệp âm thanh hợp lệ.");
  if (file.size > MAX_AUDIO_SIZE_BYTES) throw new Error("Tệp âm thanh vượt quá giới hạn 50 MB.");

  const itemId = crypto.randomUUID();
  const storagePath = `${user.id}/${itemId}`;
  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false
    });
  if (uploadError) throw uploadError;

  const artwork = metadata.kind === "book" ? "cover-forest" : "cover-blue";
  const { error: insertError } = await supabase.from("audio_items").insert({
    id: itemId,
    ...metadata,
    artwork,
    storage_path: storagePath,
    created_by: user.id
  });

  if (insertError) {
    const { error: cleanupError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .remove([storagePath]);
    if (cleanupError) {
      console.error("Could not remove the uploaded audio after metadata creation failed.", cleanupError);
      throw new Error("Không thể lưu thông tin bài nghe; tệp đã tải lên cần quản trị viên dọn khỏi Supabase Storage.");
    }
    throw insertError;
  }

  return {
    ...metadata,
    id: itemId,
    artwork,
    playCount: 0,
    storagePath,
    createdBy: user.id
  } satisfies SharedAudioItem;
}

export async function recordSharedAudioPlay(itemId: string) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { error } = await supabase.rpc("record_audio_play", { p_item_id: itemId });
  if (error) throw error;
}

export async function updateSharedAudioCollections(itemId: string, collections: AudioCollection[]) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase
    .from("audio_items")
    .update({ collections })
    .eq("id", itemId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Bạn không có quyền cập nhật danh mục nội dung này.");
}

export async function createSharedAudioPlaybackUrl(storagePath: string) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24);
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadSharedAudio(storagePath: string) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const { data, error } = await supabase.storage.from(AUDIO_BUCKET).download(storagePath);
  if (error) throw error;
  return data;
}

export async function deleteSharedAudio(item: Pick<SharedAudioItem, "id" | "storagePath">) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");

  const { error: deleteRowError } = await supabase
    .from("audio_items")
    .delete()
    .eq("id", item.id);
  if (deleteRowError) throw deleteRowError;

  const { error: deleteFileError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .remove([item.storagePath]);
  if (deleteFileError) {
    console.error("Could not remove audio file after deleting its library record.", deleteFileError);
    return false;
  }
  return true;
}

export async function inviteGoogleUser(email: string, admin: User) {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.from("allowed_users").insert({
    email: normalizedEmail,
    added_by: admin.id
  });
  if (error) throw error;
}

export function supabaseErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    const messages: Record<string, string> = {
      "23505": "Gmail này đã được mời vào kho DiNo.",
      "42501": "Bạn không có quyền với thao tác này. Kiểm tra lời mời và Supabase RLS policies.",
      "PGRST116": "Không tìm thấy nội dung được yêu cầu."
    };
    if (messages[code]) return messages[code];
  }

  if (error instanceof Error) return error.message;
  return "Đã xảy ra lỗi không xác định khi kết nối Supabase.";
}
