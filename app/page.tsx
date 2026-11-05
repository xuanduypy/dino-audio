"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Capacitor } from "@capacitor/core";
import { AudioPlayer } from "@mediagrid/capacitor-native-audio";
import type { User } from "@supabase/supabase-js";
import {
  addSharedAudio,
  addAudioItemToPlaylist,
  ADMIN_EMAIL,
  createSharedAudioPlaybackUrl,
  deleteSharedAudio,
  supabaseConfigured,
  supabaseErrorMessage,
  supabase,
  inviteGoogleUser,
  createCuratedAudioList,
  downloadSharedAudio,
  listenToMyAudioPlaylists,
  listenToMyAudioItemStates,
  listenToAuth,
  listenToCuratedAudioLists,
  listenToSharedAudio,
  loadMyAudioPlaylists,
  recordSharedAudioPlay,
  signInWithGoogle,
  signOutUser,
  setAudioItemUserState,
  type AudioCollection,
  type AudioItemUserState,
  type AudioOwnerProfile,
  type AudioPlaylist,
  type CuratedAudioList,
  type CuratedAudioListKind,
  type SharedAudioItem,
  updateSharedAudioCollections
} from "@/lib/supabase";

type MediaKind = SharedAudioItem["kind"];
type NativeAudioSession = {
  audioId: string;
  itemId: string;
  source: string;
  initialized: boolean;
};
const nativeAudioId = "dino-main-player";
const filterOptions: { id: "all" | MediaKind; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "music", label: "Âm nhạc" },
  { id: "book", label: "Sách nói" }
];
const collectionOptions: { id: AudioCollection; label: string }[] = [
  { id: "sleep", label: "Ngủ ngon" },
  { id: "relax", label: "Thư giãn" },
  { id: "fairytale", label: "Truyện cổ tích" }
];
const curatedListKindOptions: { id: CuratedAudioListKind; label: string }[] = [
  { id: "music_album", label: "Album nhạc" },
  { id: "book_album", label: "Album sách nói" },
  { id: "music_chart", label: "Bảng xếp hạng nhạc" },
  { id: "book_chart", label: "Bảng xếp hạng sách nói" }
];

type LibraryItem = Omit<SharedAudioItem, "storagePath" | "createdBy"> & {
  id: string;
  storagePath?: string;
  createdBy?: string;
  audioUrl?: string;
  duration?: number;
  createdAt?: string;
  owner?: AudioOwnerProfile | null;
};

type AppPreferences = {
  dataSaver: boolean;
  shuffle: boolean;
  repeat: boolean;
  notifications: boolean;
};

function isAppPreferences(value: unknown): value is AppPreferences {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Record<string, unknown>;
  return ["dataSaver", "shuffle", "repeat", "notifications"]
    .every((key) => typeof preferences[key] === "boolean");
}

const initialItems: LibraryItem[] = [
  {
    id: "blue-hour",
    title: "Blue Hour",
    creator: "Minh Anh",
    kind: "music",
    artwork: "cover-blue",
    collections: ["relax"],
    playCount: 0
  },
  {
    id: "little-forest",
    title: "Khu rừng nhỏ",
    creator: "Ngọc Hà",
    kind: "book",
    artwork: "cover-forest",
    collections: ["sleep", "fairytale"],
    playCount: 0
  },
  {
    id: "slow-morning",
    title: "Một ngày thật chậm",
    creator: "DiNo Studio",
    kind: "music",
    artwork: "cover-sunrise",
    collections: ["relax"],
    playCount: 0
  },
  {
    id: "the-long-way-home",
    title: "Con đường về nhà",
    creator: "An Nhiên",
    kind: "book",
    artwork: "cover-road",
    collections: ["sleep"],
    playCount: 0
  },
  {
    id: "afterglow",
    title: "Afterglow",
    creator: "Lê Bảo",
    kind: "music",
    artwork: "cover-afterglow",
    collections: ["relax"],
    playCount: 0
  }
];

const iconPaths: Record<string, string> = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  search: "m20 20-4.4-4.4M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  library: "M4 5v14M9 5v14M14 5v14M19 5v14",
  plus: "M12 5v14M5 12h14",
  play: "m8 5 12 7-12 7z",
  pause: "M8 5v14M16 5v14",
  next: "m5 5 10 7-10 7zM19 5v14",
  previous: "m19 5-10 7 10 7zM5 5v14",
  shuffle: "m3 7h2.5c4.5 0 8.5 10 13 10H21m-4-4 4 4-4 4M3 17h2.5c1.9 0 3.5-2 5-4m3-4c1.4-1.3 2.8-2 4.5-2H21m-4-4 4 4-4 4",
  repeat: "m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3",
  volume: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  heart: "M20.8 8.8c0 4.2-8.8 10-8.8 10s-8.8-5.8-8.8-10A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.8 2.4Z",
  close: "m18 6-12 12M6 6l12 12",
  mail: "M4 6h16v12H4zm0 1 8 6 8-6",
  trash: "M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6",
  tag: "M20.59 13.41 11 3.83A2.8 2.8 0 0 0 9 3H4a1 1 0 0 0-1 1v5a2.8 2.8 0 0 0 .83 2l9.58 9.59a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83ZM7 7h.01",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22zm0 0V22",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm12-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z",
  clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  user: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  upload: "M12 16V4m0 0L7 9m5-5 5 5M4 20h16",
  info: "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  share: "M12 16V3m0 0L7 8m5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  playlist: "M4 6h11M4 11h11M4 16h7m9-2v7m-3.5-3.5h7",
  queue: "M4 6h16M4 11h16M4 16h10m3 0 3 3 3-3",
  settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-6v2m0 15v2m9-9h-2m-14 0H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64",
  download: "M12 3v12m0 0 5-5m-5 5-5-5M4 17v3h16v-3"
};

function Icon({
  name,
  size = 20,
  className = ""
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name] ?? iconPaths.more} />
    </svg>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function getNativePlaybackErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  return detail
    ? `Không thể phát âm thanh trên Android: ${detail}`
    : "Không thể phát âm thanh trên Android.";
}

function formatUploadDate(value?: string) {
  if (!value) return "Không có thông tin";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không có thông tin"
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(date);
}

function getAudioFileExtension(blob: Blob) {
  const mimeType = blob.type.split(";")[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-aac": "aac",
    "audio/x-flac": "flac",
    "audio/x-m4a": "m4a",
    "audio/x-wav": "wav"
  };
  return extensions[mimeType] ?? "";
}

function getSafeAudioFileName(title: string, blob: Blob) {
  const safeTitle = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120) || "DiNo-audio";
  const extension = getAudioFileExtension(blob);
  return extension ? `${safeTitle}.${extension}` : safeTitle;
}

function getCuratedAudioKind(kind: CuratedAudioListKind): MediaKind {
  return kind.startsWith("music_") ? "music" : "book";
}

function isChartKind(kind: CuratedAudioListKind) {
  return kind.endsWith("_chart");
}

function getCuratedListTypeLabel(kind: CuratedAudioListKind) {
  return curatedListKindOptions.find((option) => option.id === kind)?.label ?? "Album";
}

function getAudioPlaybackErrorMessage(error: MediaError | null) {
  switch (error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Phát âm thanh đã bị gián đoạn. Hãy thử phát lại.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Kết nối bị gián đoạn khi tải âm thanh. Hãy kiểm tra mạng rồi thử lại.";
    case MediaError.MEDIA_ERR_DECODE:
      return "Không thể giải mã tệp âm thanh này.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Tệp âm thanh không được hỗ trợ hoặc không còn truy cập được.";
    default:
      return "Không thể phát tệp âm thanh này. Hãy thử lại.";
  }
}

export default function Home() {
  const [items, setItems] = useState(initialItems);
  const [sharedItems, setSharedItems] = useState<LibraryItem[]>([]);
  const [curatedAudioLists, setCuratedAudioLists] = useState<CuratedAudioList[]>([]);
  const [userAudioStates, setUserAudioStates] = useState<AudioItemUserState[]>([]);
  const [userPlaylists, setUserPlaylists] = useState<AudioPlaylist[]>([]);
  const [playQueue, setPlayQueue] = useState<string[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [actionMenuItemId, setActionMenuItemId] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [downloadingItemId, setDownloadingItemId] = useState<string | null>(null);
  const [detailsItem, setDetailsItem] = useState<LibraryItem | null>(null);
  const [playlistItem, setPlaylistItem] = useState<LibraryItem | null>(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);
  const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | MediaKind>("all");
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<LibraryItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false);
  const [playbackLoadingTitle, setPlaybackLoadingTitle] = useState("");
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isDataSaverEnabled, setIsDataSaverEnabled] = useState(false);
  const [areNotificationsEnabled, setAreNotificationsEnabled] = useState(false);
  const [supportsNotifications, setSupportsNotifications] = useState(false);
  const [arePreferencesLoaded, setArePreferencesLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newItemKind, setNewItemKind] = useState<MediaKind>("music");
  const [newItemCollections, setNewItemCollections] = useState<AudioCollection[]>([]);
  const [collectionEditItem, setCollectionEditItem] = useState<LibraryItem | null>(null);
  const [collectionEditSelection, setCollectionEditSelection] = useState<AudioCollection[]>([]);
  const [isSavingCollections, setIsSavingCollections] = useState(false);
  const [curatedComposerOpen, setCuratedComposerOpen] = useState(false);
  const [curatedComposerKind, setCuratedComposerKind] = useState<CuratedAudioListKind>("music_album");
  const [curatedTitle, setCuratedTitle] = useState("");
  const [curatedDescription, setCuratedDescription] = useState("");
  const [curatedItemIds, setCuratedItemIds] = useState<string[]>([]);
  const [isSavingCuratedList, setIsSavingCuratedList] = useState(false);
  const [selectedCuratedList, setSelectedCuratedList] = useState<CuratedAudioList | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(supabaseConfigured);
  const [isAndroidNative, setIsAndroidNative] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [notice, setNotice] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const isAndroidNativeRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const currentItemRef = useRef(current);
  const nativeAudioTransitionRef = useRef(false);
  const nativeAudioSessionRef = useRef<NativeAudioSession | null>(null);
  const nativeAudioGenerationRef = useRef(0);
  const nativeAudioSetupRef = useRef<Promise<void>>(Promise.resolve());
  const handleAudioEndedRef = useRef<() => void>(() => {});
  const handleAudioPlayRef = useRef<() => void>(() => {});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sharedLinkHandledRef = useRef("");
  const localAudioUrls = useRef(new Map<string, string>());
  const playbackRequestRef = useRef(0);
  const previousSharedItemIds = useRef<Set<string> | null>(null);
  const isAdmin = authUser?.email?.toLowerCase() === ADMIN_EMAIL;
  const authUserId = authUser?.id;
  const avatarUrl = [authUser?.user_metadata.avatar_url, authUser?.user_metadata.picture]
    .find((value): value is string => typeof value === "string" && value.startsWith("https://"));
  const libraryItems = authUser ? sharedItems : items;
  const actionMenuItem = actionMenuItemId
    ? libraryItems.find((item) => item.id === actionMenuItemId) ?? null
    : null;

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    return libraryItems.filter((item) => {
      const matchesFilter = activeFilter === "all" || item.kind === activeFilter;
      const matchesQuery =
        !normalizedQuery ||
        `${item.title} ${item.creator}`.toLocaleLowerCase("vi").includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, libraryItems, query]);
  const likedItemIds = useMemo(() => new Set(userAudioStates
    .filter((state) => state.liked)
    .map((state) => state.audioItemId)), [userAudioStates]);
  const savedItemIds = useMemo(() => new Set(userAudioStates
    .filter((state) => state.saved)
    .map((state) => state.audioItemId)), [userAudioStates]);
  const isLiked = (itemId: string) => likedItemIds.has(itemId);
  const isSaved = (itemId: string) => savedItemIds.has(itemId);
  const homeShelves = useMemo(() => {
    const searchShelf = { id: "recommended", title: "Kết quả tìm kiếm", items: visibleItems };
    if (query) return visibleItems.length > 0 ? [searchShelf] : [];

    const popularItems = [...visibleItems].sort((a, b) => b.playCount - a.playCount);
    return [
      { ...searchShelf, title: "Gợi ý cho bạn" },
      ...(!query && savedItemIds.size > 0
        ? [{ id: "saved", title: "Thư viện của tôi", items: visibleItems.filter((item) => savedItemIds.has(item.id)) }]
        : []),
      ...(!query && likedItemIds.size > 0
        ? [{ id: "liked", title: "Bài hát và sách đã thích", items: visibleItems.filter((item) => likedItemIds.has(item.id)) }]
        : []),
      { id: "popular", title: "Nghe nhiều", items: popularItems },
      { id: "books", title: "Sách hay", items: visibleItems.filter((item) => item.kind === "book") },
      ...collectionOptions.map((collection) => ({
        id: collection.id,
        title: collection.label,
        items: visibleItems.filter((item) => item.collections.includes(collection.id))
      }))
    ].filter((shelf) => shelf.items.length > 0);
  }, [likedItemIds, query, savedItemIds, visibleItems]);
  const curatedComposerAudioKind = getCuratedAudioKind(curatedComposerKind);
  const curatedSelectableItems = sharedItems.filter((item) => item.kind === curatedComposerAudioKind);
  const selectedCuratedItems = curatedItemIds
    .map((itemId) => curatedSelectableItems.find((item) => item.id === itemId))
    .filter((item): item is LibraryItem => Boolean(item));
  const selectedCuratedListItems = selectedCuratedList
    ? selectedCuratedList.itemIds
      .map((itemId) => sharedItems.find((item) => item.id === itemId))
      .filter((item): item is LibraryItem => Boolean(item))
    : [];

  useEffect(() => {
    const isAndroid = Capacitor.getPlatform() === "android";
    isAndroidNativeRef.current = isAndroid;
    setIsAndroidNative(isAndroid);
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentItemRef.current = current;
  }, [current]);
  const queuedItems = playQueue
    .map((itemId) => libraryItems.find((item) => item.id === itemId))
    .filter((item): item is LibraryItem => Boolean(item));
  const viewingPlaylist = userPlaylists.find((playlist) => playlist.id === viewingPlaylistId) ?? null;
  const viewingPlaylistItems = viewingPlaylist
    ? viewingPlaylist.itemIds
      .map((itemId) => libraryItems.find((item) => item.id === itemId))
      .filter((item): item is LibraryItem => Boolean(item))
    : [];
  const albumLists = curatedAudioLists.filter((list) => !isChartKind(list.kind));
  const chartLists = curatedAudioLists.filter((list) => isChartKind(list.kind));
  const renderMediaCards = (shelfItems: LibraryItem[]) => shelfItems.map((item, index) => (
    <div className="media-card-wrap" key={item.id}>
      <button
        className={`media-card ${current?.id === item.id ? "now-playing" : ""}`}
        type="button"
        onClick={() => void chooseItem(item)}
      >
        <span className={`cover-art ${item.artwork}`}>
          <span className="cover-grain" />
          {item.kind === "book"
            ? <span className="cover-word book-word">{item.title}</span>
            : <span className="cover-word music-word">{item.title.split(" ").map((word, wordIndex) => <i key={`${word}-${wordIndex}`}>{word}</i>)}</span>}
          <span className="cover-index">D / {String(index + 1).padStart(2, "0")}</span>
          <span className="card-play"><Icon name={current?.id === item.id && isPlaying ? "pause" : "play"} size={19} /></span>
        </span>
        <span className="media-card-title">{item.title}</span>
        <span className="media-card-meta">{item.kind === "book" ? "Sách nói" : "Bài hát"} <span>·</span> {item.creator}</span>
      </button>
      <button
        className="media-more"
        type="button"
        aria-label={`Tùy chọn ${item.title}`}
        aria-expanded={actionMenuItemId === item.id}
        onClick={(event) => toggleItemMenu(item, event.currentTarget)}
      >
        <Icon name="more" size={18} />
      </button>
      {isAdmin && item.storagePath && (
        <button
          className="media-delete"
          type="button"
          aria-label={`Xóa ${item.title}`}
          title="Xóa khỏi kho chung"
          onClick={() => void handleDelete(item)}
        >
          <Icon name="trash" size={15} />
        </button>
      )}
      {authUser && item.storagePath && (isAdmin || item.createdBy === authUser.id) && (
        <button
          className="media-collection-edit"
          type="button"
          aria-label={`Chỉnh kệ chủ đề cho ${item.title}`}
          title="Chỉnh kệ chủ đề"
          onClick={() => {
            setCollectionEditItem(item);
            setCollectionEditSelection(item.collections);
          }}
        >
          <Icon name="tag" size={15} />
        </button>
      )}
    </div>
  ));
  const renderCuratedListCards = (listItems: CuratedAudioList[]) => (
    <div className="media-grid shelf-grid curated-list-grid">
      {listItems.map((list) => {
        const firstItem = sharedItems.find((item) => item.id === list.itemIds[0]);
        const chart = isChartKind(list.kind);
        const previewTitles = list.itemIds.slice(0, 3).map((id) =>
          sharedItems.find((item) => item.id === id)?.title
        ).filter((title): title is string => Boolean(title));
        return (
          <button
            className="curated-list-card"
            key={list.id}
            type="button"
            onClick={() => setSelectedCuratedList(list)}
          >
            <span className={`curated-list-cover ${firstItem?.artwork ?? (getCuratedAudioKind(list.kind) === "book" ? "cover-forest" : "cover-blue")}`}>
              <span className="curated-list-cover-type">{chart ? "XẾP HẠNG" : "ALBUM"}</span>
              <Icon name={chart ? "more" : getCuratedAudioKind(list.kind) === "book" ? "book" : "music"} size={34} />
              {chart && <span className="curated-list-cover-ranks">01 · 02 · 03</span>}
            </span>
            <span className="curated-list-title">{list.title}</span>
            <span className="curated-list-description">
              {chart && previewTitles.length > 0
                ? previewTitles.join(" · ")
                : list.description || `${list.itemIds.length} ${getCuratedAudioKind(list.kind) === "book" ? "sách nói" : "bài nhạc"}`}
            </span>
          </button>
        );
      })}
    </div>
  );
  const renderUserPlaylistCards = () => (
    <div className="media-grid shelf-grid curated-list-grid">
      {userPlaylists.map((playlist) => {
        const firstItem = libraryItems.find((item) => item.id === playlist.itemIds[0]);
        return (
          <button
            className="curated-list-card"
            key={playlist.id}
            type="button"
            onClick={() => setViewingPlaylistId(playlist.id)}
          >
            <span className={`curated-list-cover ${firstItem?.artwork ?? "cover-blue"}`}>
              <span className="curated-list-cover-type">DANH SÁCH PHÁT</span>
              <Icon name="playlist" size={34} />
            </span>
            <span className="curated-list-title">{playlist.title}</span>
            <span className="curated-list-description">
              {playlist.itemIds.length} nội dung{playlist.description ? ` · ${playlist.description}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );

  function toggleItemMenu(item: LibraryItem, button: HTMLButtonElement) {
    if (actionMenuItemId === item.id) {
      setActionMenuItemId(null);
      return;
    }
    const bounds = button.getBoundingClientRect();
    setActionMenuPosition({
      top: Math.max(12, Math.min(bounds.bottom + 5, window.innerHeight - 370)),
      left: Math.max(12, Math.min(bounds.right - 222, window.innerWidth - 234))
    });
    setActionMenuItemId(item.id);
  }

  useEffect(() => {
    if (mobileSearchOpen) searchInputRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!actionMenuItemId) return;
    const closeMenu = () => setActionMenuItemId(null);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [actionMenuItemId]);

  useEffect(() => {
    setSupportsNotifications(typeof Notification !== "undefined");
    try {
      const savedPreferences = window.localStorage.getItem("dino-app-settings-v1");
      if (savedPreferences) {
        const parsedPreferences: unknown = JSON.parse(savedPreferences);
        if (!isAppPreferences(parsedPreferences)) {
          throw new Error("Cấu trúc cài đặt đã lưu không hợp lệ.");
        }
        setIsDataSaverEnabled(parsedPreferences.dataSaver);
        setIsShuffle(parsedPreferences.shuffle);
        setIsRepeat(parsedPreferences.repeat);
        setAreNotificationsEnabled(
          parsedPreferences.notifications
          && typeof Notification !== "undefined"
          && Notification.permission !== "denied"
        );
      }
    } catch (error) {
      setNotice(`Không đọc được cài đặt đã lưu: ${supabaseErrorMessage(error)}`);
    } finally {
      setArePreferencesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!arePreferencesLoaded) return;
    try {
      window.localStorage.setItem("dino-app-settings-v1", JSON.stringify({
        dataSaver: isDataSaverEnabled,
        shuffle: isShuffle,
        repeat: isRepeat,
        notifications: areNotificationsEnabled
      } satisfies AppPreferences));
    } catch (error) {
      setNotice(`Không lưu được cài đặt trên thiết bị: ${supabaseErrorMessage(error)}`);
    }
  }, [areNotificationsEnabled, arePreferencesLoaded, isDataSaverEnabled, isRepeat, isShuffle]);

  useEffect(() => {
    previousSharedItemIds.current = null;
  }, [authUserId]);

  useEffect(() => {
    const previousIds = previousSharedItemIds.current;
    previousSharedItemIds.current = new Set(sharedItems.map((item) => item.id));
    if (
      !previousIds
      || !areNotificationsEnabled
      || !authUserId
      || typeof Notification === "undefined"
      || Notification.permission !== "granted"
      || !document.hidden
    ) return;

    const newItems = sharedItems.filter((item) => !previousIds.has(item.id));
    if (newItems.length === 0) return;

    try {
      const title = newItems.length === 1
        ? `DiNo · ${newItems[0].title}`
        : "DiNo · Nội dung mới trong kho";
      const body = newItems.length === 1
        ? `${newItems[0].creator} vừa thêm nội dung mới.`
        : `Có ${newItems.length} nội dung mới được thêm vào kho.`;
      new Notification(title, { body });
    } catch (error) {
      setNotice(`Không thể hiển thị thông báo: ${supabaseErrorMessage(error)}`);
    }
  }, [areNotificationsEnabled, authUserId, sharedItems]);

  useEffect(() => {
    return listenToAuth(
      setAuthUser,
      (error) => setNotice(supabaseErrorMessage(error))
    );
  }, []);

  useEffect(() => {
    if (!authUser || !supabaseConfigured || !supabase) {
      setSharedItems([]);
      setCuratedAudioLists([]);
      setIsCloudLoading(false);
      return;
    }

    setIsCloudLoading(true);
    return listenToSharedAudio(
      (nextItems) => {
        setSharedItems(nextItems);
        setIsCloudLoading(false);
      },
      (error) => {
        setIsCloudLoading(false);
        setNotice(supabaseErrorMessage(error));
      }
    );
  }, [authUser]);

  useEffect(() => {
    if (!authUserId || !supabaseConfigured || !supabase) {
      setCuratedAudioLists([]);
      return;
    }

    return listenToCuratedAudioLists(
      setCuratedAudioLists,
      (error) => setNotice(supabaseErrorMessage(error))
    );
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || !supabaseConfigured || !supabase) {
      setUserAudioStates([]);
      setUserPlaylists([]);
      return;
    }

    return listenToMyAudioItemStates(
      authUserId,
      setUserAudioStates,
      (error) => setNotice(supabaseErrorMessage(error))
    );
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || !supabaseConfigured) {
      setUserPlaylists([]);
      return;
    }

    return listenToMyAudioPlaylists(
      authUserId,
      setUserPlaylists,
      (error) => setNotice(supabaseErrorMessage(error))
    );
  }, [authUserId]);

  useEffect(() => {
    if (authUser) return;
    localAudioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    localAudioUrls.current.clear();
    if (current?.storagePath) {
      setCurrent(null);
      setIsPlaying(false);
      setProgress(0);
    }
  }, [authUser, current?.storagePath]);

  useEffect(() => {
    const audioUrls = localAudioUrls.current;
    return () => {
      audioUrls.forEach((url) => URL.revokeObjectURL(url));
      audioUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (isAndroidNative) return;
    if (!current?.audioUrl || !audioRef.current) return;
    if (isPlaying) {
      void audioRef.current.play().catch(() => {
        setIsPlaying(false);
        setNotice("Không thể phát tệp âm thanh này.");
      });
    } else {
      audioRef.current.pause();
    }
  }, [current, isAndroidNative, isPlaying]);

  const chooseItem = useCallback(async (item: LibraryItem) => {
    const requestId = ++playbackRequestRef.current;
    if (current?.id === item.id) {
      setIsPreparingPlayback(false);
      setPlaybackLoadingTitle("");
      setIsPlaying((playing) => !playing);
      return;
    }

    let playableItem = item;
    setIsPlaying(false);
    setIsPreparingPlayback(Boolean(
      playableItem.storagePath
      && (isAndroidNativeRef.current || !playableItem.audioUrl)
    ));
    setPlaybackLoadingTitle(playableItem.storagePath ? playableItem.title : "");
    if (playableItem.storagePath && isAndroidNativeRef.current) {
      try {
        setNotice("Đang chuẩn bị âm thanh...");
        playableItem = {
          ...playableItem,
          audioUrl: await createSharedAudioPlaybackUrl(playableItem.storagePath)
        };
      } catch (error) {
        if (playbackRequestRef.current !== requestId) return;
        setIsPreparingPlayback(false);
        setPlaybackLoadingTitle("");
        setNotice(supabaseErrorMessage(error));
        return;
      }
    } else if (playableItem.storagePath && !playableItem.audioUrl) {
      try {
        setNotice("Đang chuẩn bị phát trực tuyến...");
        playableItem = {
          ...playableItem,
          audioUrl: await createSharedAudioPlaybackUrl(playableItem.storagePath)
        };
      } catch (error) {
        if (playbackRequestRef.current !== requestId) return;
        setIsPreparingPlayback(false);
        setPlaybackLoadingTitle("");
        setNotice(supabaseErrorMessage(error));
        return;
      }
    }

    if (playbackRequestRef.current !== requestId) return;
    setIsPreparingPlayback(false);
    setPlaybackLoadingTitle("");
    if (!playableItem.audioUrl) {
      setNotice("Bản nghe thử chưa có âm thanh. Hãy thêm tệp của bạn để nghe.");
      return;
    }
    setCurrent(playableItem);
    setProgress(0);
    setDuration(playableItem.duration ?? 0);
    setIsPlaying(true);
  }, [current]);

  useEffect(() => {
    const sharedItemId = new URLSearchParams(window.location.search).get("item");
    if (!sharedItemId || sharedLinkHandledRef.current === sharedItemId || isCloudLoading) return;
    if (!authUser && supabaseConfigured) return;
    const item = libraryItems.find((libraryItem) => libraryItem.id === sharedItemId);
    if (!item) {
      sharedLinkHandledRef.current = sharedItemId;
      setNotice("Không tìm thấy nội dung. Có thể liên kết đã bị xóa hoặc bạn chưa được mời vào kho.");
    } else {
      sharedLinkHandledRef.current = sharedItemId;
      void chooseItem(item);
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("item");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [authUser, chooseItem, isCloudLoading, libraryItems]);

  async function handleAudioPlay() {
    if (!current?.storagePath || !authUser) return;
    try {
      await recordSharedAudioPlay(current.id);
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    }
  }

  async function toggleAudioState(item: LibraryItem, action: "liked" | "saved") {
    if (!authUser || !item.storagePath) {
      setNotice("Đăng nhập vào kho DiNo để lưu bài và đồng bộ trên các thiết bị.");
      return;
    }

    const enabled = !(action === "liked" ? isLiked(item.id) : isSaved(item.id));
    try {
      await setAudioItemUserState(item.id, action, enabled);
      setUserAudioStates((states) => {
        const existing = states.find((state) => state.audioItemId === item.id);
        const nextState: AudioItemUserState = {
          audioItemId: item.id,
          liked: action === "liked" ? enabled : existing?.liked ?? false,
          saved: action === "saved" ? enabled : existing?.saved ?? false
        };
        return nextState.liked || nextState.saved
          ? [...states.filter((state) => state.audioItemId !== item.id), nextState]
          : states.filter((state) => state.audioItemId !== item.id);
      });
      setNotice(action === "liked"
        ? enabled ? "Đã thêm vào danh sách yêu thích." : "Đã bỏ khỏi danh sách yêu thích."
        : enabled ? "Đã lưu vào thư viện của bạn." : "Đã bỏ khỏi thư viện của bạn.");
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    }
  }

  function addToQueue(item: LibraryItem) {
    setPlayQueue((queue) => queue.includes(item.id) ? queue : [...queue, item.id]);
    setActionMenuItemId(null);
    setNotice("Đã thêm vào danh sách chờ.");
  }

  function openPlaylistPicker(item: LibraryItem) {
    if (!authUser || !item.storagePath) {
      setNotice("Đăng nhập vào kho DiNo để tạo và lưu danh sách phát.");
      return;
    }
    setActionMenuItemId(null);
    setPlaylistItem(item);
    setNewPlaylistTitle("");
    setSelectedPlaylistId(userPlaylists[0]?.id ?? "");
  }

  async function saveItemToPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playlistItem || !authUser) {
      setNotice("Đăng nhập vào kho DiNo để lưu danh sách phát.");
      return;
    }
    if (!newPlaylistTitle.trim() && !selectedPlaylistId) {
      setNotice("Nhập tên danh sách phát mới.");
      return;
    }

    setIsAddingToPlaylist(true);
    try {
      const playlistId = await addAudioItemToPlaylist({
        audioItemId: playlistItem.id,
        ...(newPlaylistTitle.trim()
          ? { newPlaylistTitle: newPlaylistTitle.trim() }
          : { playlistId: selectedPlaylistId })
      });
      const nextPlaylists = await loadMyAudioPlaylists();
      setUserPlaylists(nextPlaylists);
      setPlaylistItem(null);
      setNotice(`Đã thêm vào danh sách “${nextPlaylists.find((playlist) => playlist.id === playlistId)?.title ?? "phát"}”.`);
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    } finally {
      setIsAddingToPlaylist(false);
    }
  }

  async function shareAudioItem(item: LibraryItem) {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("item", item.id);
    const url = shareUrl.toString();
    const shareData = {
      title: `${item.title} — DiNo`,
      text: `${item.kind === "book" ? "Sách nói" : "Bài hát"} “${item.title}” · ${item.creator}`,
      url
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setNotice("Đã sao chép liên kết chia sẻ. Người nhận cần đăng nhập vào kho DiNo.");
      } else {
        setNotice("Trình duyệt này chưa hỗ trợ chia sẻ hoặc sao chép liên kết.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice(supabaseErrorMessage(error));
    }
    setActionMenuItemId(null);
  }

  async function downloadAudioItem(item: LibraryItem) {
    setActionMenuItemId(null);
    if (downloadingItemId) return;
    if (!item.storagePath && !item.audioUrl) {
      setNotice("Bản nghe thử này chưa có tệp âm thanh để tải xuống.");
      return;
    }
    if (item.storagePath && !authUser) {
      setNotice("Đăng nhập vào kho DiNo để tải tệp âm thanh riêng tư.");
      return;
    }

    setDownloadingItemId(item.id);
    setNotice("Đang chuẩn bị tệp tải xuống...");
    try {
      let audioFile: Blob;
      if (item.storagePath) {
        audioFile = await downloadSharedAudio(item.storagePath);
      } else {
        const audioUrl = item.audioUrl;
        if (!audioUrl) throw new Error("Không tìm thấy tệp âm thanh.");
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error("Không thể đọc tệp âm thanh trên thiết bị.");
        audioFile = await response.blob();
      }
      if (audioFile.size === 0) throw new Error("Tệp âm thanh trống, không thể tải xuống.");

      const downloadUrl = URL.createObjectURL(audioFile);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = getSafeAudioFileName(item.title, audioFile);
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      setNotice(`Đã tải xuống “${link.download}”.`);
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    } finally {
      setDownloadingItemId(null);
    }
  }

  function openSocialShare(item: LibraryItem, service: "zalo" | "facebook") {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("item", item.id);
    const encodedUrl = encodeURIComponent(shareUrl.toString());
    const target = service === "zalo"
      ? `https://zalo.me/share?url=${encodedUrl}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    window.open(target, "_blank", "noopener,noreferrer");
    setActionMenuItemId(null);
    setNotice("Người nhận cần đăng nhập tài khoản được mời vào kho DiNo để nghe.");
  }

  function getOwnerDisplayName(item: LibraryItem) {
    if (item.createdBy && authUser?.id === item.createdBy) return "Bạn";
    return item.owner?.displayName ?? (item.createdBy ? "Thành viên DiNo" : "Thư viện mẫu DiNo");
  }

  async function saveCollectionEdits() {
    if (!collectionEditItem || !authUser) return;
    setIsSavingCollections(true);
    try {
      await updateSharedAudioCollections(collectionEditItem.id, collectionEditSelection);
      setSharedItems((existing) => existing.map((item) => item.id === collectionEditItem.id
        ? { ...item, collections: collectionEditSelection }
        : item));
      setCollectionEditItem(null);
      setNotice("Đã cập nhật kệ chủ đề.");
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    } finally {
      setIsSavingCollections(false);
    }
  }

  async function addAudio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) {
      setIsAddOpen(false);
      setNotice("Chỉ quản trị viên mới có thể thêm nhạc hoặc sách. Vui lòng liên hệ quản trị viên.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const file = formData.get("audio");
    const title = String(formData.get("title") ?? "").trim();
    const creator = String(formData.get("creator") ?? "").trim();
    const kindValue = String(formData.get("kind"));
    if (kindValue !== "music" && kindValue !== "book") {
      setNotice("Hãy chọn loại nội dung hợp lệ.");
      return;
    }
    const kind: MediaKind = kindValue;
    const selectedCollections = collectionOptions
      .filter((collection) => formData.getAll("collections").includes(collection.id))
      .filter((collection) => kind === "book" || collection.id !== "fairytale")
      .map((collection) => collection.id);

    if (!title || !creator) {
      setNotice("Vui lòng nhập tiêu đề và tên nghệ sĩ/tác giả.");
      return;
    }

    const audioFile = file instanceof File ? file : null;
    if (!audioFile || audioFile.size === 0) {
      setNotice("Hãy chọn một tệp âm thanh đã hoàn thiện.");
      return;
    }

    setIsUploading(true);
    try {
      let item: LibraryItem;
      if (authUser && supabaseConfigured) {
        item = await addSharedAudio(audioFile, { title, creator, kind, collections: selectedCollections }, authUser);
        setSharedItems((existing) => [item, ...existing.filter((entry) => entry.id !== item.id)]);
        setNotice("Đã tải lên kho dùng chung.");
      } else {
        item = {
          id: `${Date.now()}-${audioFile.name}`,
          title,
          creator,
          kind,
          artwork: kind === "book" ? "cover-forest" : "cover-blue",
          collections: selectedCollections,
          playCount: 0,
          audioUrl: URL.createObjectURL(audioFile)
        };
        if (item.audioUrl) localAudioUrls.current.set(item.id, item.audioUrl);
        setItems((existing) => [item, ...existing]);
        setNotice(supabaseConfigured
          ? "Đã thêm trên thiết bị này. Đăng nhập để chia sẻ với gia đình."
          : "Đã thêm trên thiết bị này. Kết nối Supabase để đồng bộ.");
      }

      setIsAddOpen(false);
      setNewItemCollections([]);
      setActiveFilter("all");
      setQuery("");
      await chooseItem(item);
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  function openAddDialog(kind: MediaKind = "music") {
    if (!isAdmin) {
      setCreateMenuOpen(false);
      setNotice("Chỉ quản trị viên mới có thể thêm nhạc hoặc sách. Vui lòng liên hệ quản trị viên.");
      return;
    }

    setNewItemKind(kind);
    setNewItemCollections([]);
    setCreateMenuOpen(false);
    setIsAddOpen(true);
  }

  async function toggleNewContentNotifications() {
    if (areNotificationsEnabled) {
      setAreNotificationsEnabled(false);
      setNotice("Đã tắt thông báo nội dung mới.");
      return;
    }
    if (!supportsNotifications || typeof Notification === "undefined") {
      setNotice("Trình duyệt này không hỗ trợ thông báo.");
      return;
    }
    if (Notification.permission === "denied") {
      setNotice("Thông báo DiNo đang bị chặn. Hãy cho phép trong cài đặt trình duyệt.");
      return;
    }

    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setNotice("Chưa được cấp quyền thông báo cho DiNo.");
        return;
      }
      setAreNotificationsEnabled(true);
      setNotice("Đã bật thông báo khi có nội dung mới trong kho.");
    } catch (error) {
      setNotice(`Không thể bật thông báo: ${supabaseErrorMessage(error)}`);
    }
  }

  function openCuratedComposer(kind: CuratedAudioListKind) {
    if (!authUser || !isAdmin) {
      setNotice("Chỉ quản trị viên mới có thể tạo album và bảng xếp hạng.");
      return;
    }
    if (!supabaseConfigured) {
      setNotice("Hãy cấu hình Supabase để lưu album và bảng xếp hạng dùng chung.");
      return;
    }
    setCuratedComposerKind(kind);
    setCuratedTitle("");
    setCuratedDescription("");
    setCuratedItemIds([]);
    setProfileOpen(false);
    setCreateMenuOpen(false);
    setCuratedComposerOpen(true);
  }

  async function saveCuratedAudioList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authUser || !isAdmin) {
      setNotice("Chỉ quản trị viên mới có thể tạo album và bảng xếp hạng.");
      return;
    }
    if (curatedItemIds.length === 0) {
      setNotice("Hãy chọn ít nhất một nội dung cho album hoặc bảng xếp hạng.");
      return;
    }
    if (curatedItemIds.length !== selectedCuratedItems.length) {
      setNotice("Danh sách đã chọn có nội dung không còn trong kho. Hãy chọn lại.");
      return;
    }

    setIsSavingCuratedList(true);
    try {
      const input = {
        title: curatedTitle.trim(),
        description: curatedDescription.trim(),
        kind: curatedComposerKind,
        itemIds: curatedItemIds
      };
      const id = await createCuratedAudioList(input);
      setCuratedAudioLists((existing) => [{
        ...input,
        id,
        createdAt: new Date().toISOString()
      }, ...existing]);
      setCuratedComposerOpen(false);
      setCuratedTitle("");
      setCuratedDescription("");
      setCuratedItemIds([]);
      setNotice(isChartKind(curatedComposerKind)
        ? "Đã tạo bảng xếp hạng và đồng bộ cho thư viện."
        : "Đã tạo album và đồng bộ cho thư viện.");
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    } finally {
      setIsSavingCuratedList(false);
    }
  }

  function moveCuratedItem(itemId: string, offset: number) {
    setCuratedItemIds((currentIds) => {
      const currentIndex = currentIds.indexOf(itemId);
      const nextIndex = currentIndex + offset;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentIds.length) return currentIds;
      const nextIds = [...currentIds];
      [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];
      return nextIds;
    });
  }

  async function handleGoogleSignIn() {
    if (!supabaseConfigured) {
      setNotice("Hãy cấu hình Supabase theo hướng dẫn trong README trước khi đăng nhập.");
      return;
    }

    setIsAuthBusy(true);
    try {
      await signInWithGoogle();
      setProfileOpen(false);
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setIsAuthBusy(true);
    try {
      await signOutUser();
      setProfileOpen(false);
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authUser || !isAdmin) return;
    try {
      await inviteGoogleUser(inviteEmail, authUser);
      setInviteEmail("");
      setNotice("Đã mời Gmail vào kho DiNo. Họ có thể đăng nhập để truy cập.");
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    }
  }

  async function handleDelete(item: LibraryItem) {
    if (!isAdmin || !item.storagePath) return;
    try {
      const fileDeleted = await deleteSharedAudio({ id: item.id, storagePath: item.storagePath });
      if (current?.id === item.id) {
        setCurrent(null);
        setIsPlaying(false);
      }
      setNotice(fileDeleted
        ? "Đã xóa nội dung khỏi kho chung."
        : "Đã xóa mục khỏi thư viện, nhưng tệp còn sót trong Storage. Hãy kiểm tra Supabase.");
    } catch (error) {
      setNotice(supabaseErrorMessage(error));
    }
  }

  function onAudioLoaded(event: ChangeEvent<HTMLAudioElement>) {
    const audioDuration = event.currentTarget.duration;
    if (!Number.isFinite(audioDuration) || audioDuration <= 0) return;
    setDuration(audioDuration);
    if (current) {
      setCurrent({ ...current, duration: audioDuration });
    }
  }

  function playQueuedItem(item: LibraryItem) {
    setPlayQueue((queue) => queue.filter((itemId) => itemId !== item.id));
    if (current?.id === item.id) {
      if (isAndroidNativeRef.current && nativeAudioSessionRef.current) {
        void AudioPlayer.seek({ audioId: nativeAudioId, timeInSeconds: 0 }).catch(() => {
          setNotice("Không thể tua nội dung đang phát.");
        });
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
      setProgress(0);
      setIsPlaying(true);
      return;
    }
    void chooseItem(item);
  }

  function playNext() {
    const queuedItemIds = playQueue.filter((itemId) => libraryItems.some((item) => item.id === itemId));
    if (queuedItemIds.length > 0) {
      const nextQueuedId = queuedItemIds[0];
      const nextQueuedItem = libraryItems.find((item) => item.id === nextQueuedId);
      if (nextQueuedItem) {
        playQueuedItem(nextQueuedItem);
        return;
      }
    } else if (playQueue.length > 0) {
      setPlayQueue([]);
    }

    const playableItems = libraryItems.filter((item) => item.audioUrl || item.storagePath);
    if (playableItems.length === 0) {
      setNotice("Thêm tệp âm thanh để phát và chuyển bài.");
      return;
    }
    if (isShuffle && playableItems.length > 1) {
      const alternatives = playableItems.filter((item) => item.id !== current?.id);
      chooseItem(alternatives[Math.floor(Math.random() * alternatives.length)]);
      return;
    }
    const currentIndex = playableItems.findIndex((item) => item.id === current?.id);
    chooseItem(playableItems[(currentIndex + 1 + playableItems.length) % playableItems.length]);
  }

  function playPrevious() {
    if (isAndroidNativeRef.current && progress > 3) {
      void AudioPlayer.seek({ audioId: nativeAudioId, timeInSeconds: 0 }).catch(() => {
        setNotice("Không thể tua nội dung đang phát.");
      });
      setProgress(0);
      return;
    }
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const playableItems = libraryItems.filter((item) => item.audioUrl || item.storagePath);
    if (playableItems.length === 0) {
      setNotice("Thêm tệp âm thanh để phát và chuyển bài.");
      return;
    }
    const currentIndex = playableItems.findIndex((item) => item.id === current?.id);
    chooseItem(playableItems[(currentIndex - 1 + playableItems.length) % playableItems.length]);
  }

  function handleAudioEnded() {
    if (isRepeat && isAndroidNativeRef.current && nativeAudioSessionRef.current) {
      void AudioPlayer.seek({ audioId: nativeAudioId, timeInSeconds: 0 })
        .then(() => AudioPlayer.play({ audioId: nativeAudioId }))
        .catch(() => {
          setIsPlaying(false);
          setNotice("Không thể phát lại nội dung này.");
        });
      return;
    }
    if (isRepeat && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {
        setIsPlaying(false);
        setNotice("Không thể tiếp tục phát tệp âm thanh này.");
      });
      return;
    }
    setIsPlaying(false);
    setProgress(0);
    playNext();
  }

  handleAudioEndedRef.current = handleAudioEnded;
  handleAudioPlayRef.current = () => {
    void handleAudioPlay();
  };

  useEffect(() => {
    if (!isAndroidNative) return;

    const activeItem = currentItemRef.current;
    if (!activeItem?.audioUrl) {
      const session = nativeAudioSessionRef.current;
      if (!session) return;

      const generation = ++nativeAudioGenerationRef.current;
      nativeAudioSessionRef.current = null;
      const teardown = nativeAudioSetupRef.current.catch(() => undefined).then(async () => {
        if (generation !== nativeAudioGenerationRef.current) return;
        nativeAudioTransitionRef.current = true;
        await AudioPlayer.stop({ audioId: session.audioId });
        await AudioPlayer.destroy({ audioId: session.audioId });
        nativeAudioTransitionRef.current = false;
      });
      nativeAudioSetupRef.current = teardown.catch((error: unknown) => {
        nativeAudioTransitionRef.current = false;
        setNotice(getNativePlaybackErrorMessage(error));
      });
      return;
    }

    const source = activeItem.audioUrl;
    const generation = ++nativeAudioGenerationRef.current;
    const setup = nativeAudioSetupRef.current.catch(() => undefined).then(async () => {
      if (generation !== nativeAudioGenerationRef.current) return;
      nativeAudioTransitionRef.current = true;

      let session = nativeAudioSessionRef.current;
      if (!session) {
        await AudioPlayer.create({
          audioId: nativeAudioId,
          audioSource: source,
          albumTitle: "DiNo",
          artistName: activeItem.creator,
          friendlyTitle: activeItem.title,
          useForNotification: true,
          showSeekBackward: true,
          showSeekForward: true
        });
        if (generation !== nativeAudioGenerationRef.current) {
          await AudioPlayer.destroy({ audioId: nativeAudioId });
          return;
        }

        session = {
          audioId: nativeAudioId,
          itemId: activeItem.id,
          source,
          initialized: false
        };
        nativeAudioSessionRef.current = session;
        await AudioPlayer.onAudioReady({ audioId: nativeAudioId }, () => {
          const readySession = nativeAudioSessionRef.current;
          if (!readySession) return;
          void AudioPlayer.getDuration({ audioId: readySession.audioId })
            .then(({ duration: audioDuration }) => {
              if (
                nativeAudioSessionRef.current?.itemId !== readySession.itemId ||
                !Number.isFinite(audioDuration) ||
                audioDuration <= 0
              ) return;
              setDuration(audioDuration);
              setCurrent((item) => item?.id === readySession.itemId
                ? { ...item, duration: audioDuration }
                : item);
            })
            .catch((error: unknown) => {
              setNotice(getNativePlaybackErrorMessage(error));
            });
        });
        await AudioPlayer.onAudioEnd({ audioId: nativeAudioId }, () => {
          handleAudioEndedRef.current();
        });
        await AudioPlayer.onPlaybackStatusChange({ audioId: nativeAudioId }, ({ status }) => {
          if (!nativeAudioSessionRef.current || nativeAudioTransitionRef.current) return;
          setIsPlaying(status === "playing");
          if (status === "playing") handleAudioPlayRef.current();
          if (status === "stopped") setProgress(0);
        });
        await AudioPlayer.initialize({ audioId: nativeAudioId });
        session.initialized = true;
      } else if (session.itemId !== activeItem.id || session.source !== source) {
        session = { ...session, itemId: activeItem.id, source };
        nativeAudioSessionRef.current = session;
        await AudioPlayer.changeAudioSource({ audioId: session.audioId, source });
        await AudioPlayer.changeMetadata({
          audioId: session.audioId,
          albumTitle: "DiNo",
          artistName: activeItem.creator,
          friendlyTitle: activeItem.title
        });
      }

      if (generation !== nativeAudioGenerationRef.current) return;
      nativeAudioTransitionRef.current = false;
      if (isPlayingRef.current) {
        await AudioPlayer.play({ audioId: nativeAudioId });
      }
    });

    nativeAudioSetupRef.current = setup.catch(async (error: unknown) => {
      if (generation !== nativeAudioGenerationRef.current) return;
      nativeAudioTransitionRef.current = false;
      const failedSession = nativeAudioSessionRef.current;
      if (failedSession?.itemId === activeItem.id && !failedSession.initialized) {
        nativeAudioSessionRef.current = null;
        try {
          await AudioPlayer.destroy({ audioId: failedSession.audioId });
        } catch (cleanupError) {
          setNotice(getNativePlaybackErrorMessage(cleanupError));
        }
      }
      setCurrent((item) => item?.id === activeItem.id ? null : item);
      setIsPlaying(false);
      setNotice(getNativePlaybackErrorMessage(error));
    });

    return () => {
      if (generation === nativeAudioGenerationRef.current) {
        nativeAudioGenerationRef.current += 1;
      }
    };
  }, [current?.audioUrl, current?.id, isAndroidNative]);

  useEffect(() => {
    if (!isAndroidNative || !current?.audioUrl) return;
    const session = nativeAudioSessionRef.current;
    if (!session?.initialized || session.itemId !== current.id) return;

    const command = isPlaying
      ? AudioPlayer.play({ audioId: session.audioId })
      : AudioPlayer.pause({ audioId: session.audioId });
    void command.catch((error: unknown) => {
      setIsPlaying(false);
      setNotice(getNativePlaybackErrorMessage(error));
    });
  }, [current?.audioUrl, current?.id, isAndroidNative, isPlaying]);

  useEffect(() => {
    if (!isAndroidNative || !isPlaying || !current?.audioUrl) return;
    let active = true;
    let interval = 0;
    let isUpdating = false;
    const updateProgress = async () => {
      const session = nativeAudioSessionRef.current;
      if (!session?.initialized || session.itemId !== current.id || isUpdating) return;
      isUpdating = true;
      try {
        const { currentTime } = await AudioPlayer.getCurrentTime({ audioId: session.audioId });
        if (active && nativeAudioSessionRef.current?.itemId === current.id && Number.isFinite(currentTime)) {
          setProgress(currentTime);
        }
      } catch (error) {
        if (active) {
          window.clearInterval(interval);
          setNotice(getNativePlaybackErrorMessage(error));
        }
      } finally {
        isUpdating = false;
      }
    };
    void updateProgress();
    interval = window.setInterval(() => void updateProgress(), 500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [current?.audioUrl, current?.id, isAndroidNative, isPlaying]);

  return (
    <main id="home" className="app-shell">
      <aside className="sidebar">
        <div className="profile-wrap sidebar-profile">
          <button
            className="profile-button"
            type="button"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((open) => !open)}
          >
            {avatarUrl ? (
              <Image
                className="avatar"
                src={avatarUrl}
                alt=""
                width={27}
                height={27}
                unoptimized
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="avatar avatar-placeholder"><Icon name="user" size={16} /></span>
            )}
            <span className="profile-name">
              {typeof authUser?.user_metadata.full_name === "string"
                ? authUser.user_metadata.full_name
                : "Khách"}
            </span>
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <strong>
                {typeof authUser?.user_metadata.full_name === "string"
                  ? authUser.user_metadata.full_name
                  : "Chào bạn 👋"}
              </strong>
              <p>{authUser?.email ?? (supabaseConfigured
                ? "Đăng nhập Google để truy cập kho gia đình."
                : "Cấu hình Supabase để bật đăng nhập và đồng bộ.")}</p>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  setSettingsOpen(true);
                }}
              >
                <Icon name="settings" size={16} /> Cài đặt ứng dụng
              </button>
              {authUser ? (
                <>
                  {isAdmin && <span className="admin-badge">QUẢN TRỊ VIÊN</span>}
                  {isAdmin && (
                    <form className="invite-form" onSubmit={handleInvite}>
                      <label className="field-label" htmlFor="invite-email">Mời người thân bằng Gmail</label>
                      <input
                        className="form-input"
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="ten@gmail.com"
                        pattern="[A-Za-z0-9._%+-]+@gmail\.com"
                        title="Nhập địa chỉ Gmail cá nhân."
                        required
                      />
                      <button type="submit">Mời vào kho chung</button>
                    </form>
                  )}
                  {isAdmin && (
                    <div className="profile-admin-actions">
                      <span className="admin-menu-label">QUẢN LÝ THƯ VIỆN</span>
                      <button type="button" onClick={() => openCuratedComposer("music_album")}>
                        <Icon name="plus" size={15} /> Tạo album nhạc / sách
                      </button>
                      <button type="button" onClick={() => openCuratedComposer("music_chart")}>
                        <Icon name="more" size={15} /> Tạo bảng xếp hạng
                      </button>
                    </div>
                  )}
                  <button type="button" disabled={isAuthBusy} onClick={handleSignOut}>
                    {isAuthBusy ? "Đang đăng xuất…" : "Đăng xuất"}
                  </button>
                </>
              ) : (
                <button type="button" disabled={isAuthBusy} onClick={handleGoogleSignIn}>
                  {isAuthBusy ? "Đang kết nối…" : "Đăng nhập bằng Google"}
                </button>
              )}
            </div>
          )}
        </div>
        <div className={`mobile-filter-row ${mobileSearchOpen ? "search-open" : ""}`} role="tablist" aria-label="Lọc thư viện">
          {filterOptions.map((filter) => (
            <button
              key={filter.id}
              role="tab"
              aria-selected={activeFilter === filter.id}
              className={`filter-chip ${activeFilter === filter.id ? "selected" : ""}`}
              type="button"
              onClick={() => {
                setActiveFilter(filter.id);
                setMobileSearchOpen(false);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <nav className="primary-nav" aria-label="Điều hướng chính">
          <button
            className="nav-link active"
            type="button"
            onClick={() => {
              setMobileSearchOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Icon name="home" /> <span>Trang chủ</span>
          </button>
          <button
            className={`nav-link ${mobileSearchOpen ? "active" : ""}`}
            type="button"
            aria-pressed={mobileSearchOpen}
            onClick={() => setMobileSearchOpen((open) => !open)}
          >
            <Icon name="search" /> <span>Tìm kiếm</span>
          </button>
          <button
            className="nav-link mobile-nav-link"
            type="button"
            onClick={() => {
              setMobileSearchOpen(false);
              document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Icon name="library" /> <span>Thư viện</span>
          </button>
          {isAdmin ? (
            <button
              className={`nav-link mobile-nav-link ${createMenuOpen ? "active" : ""}`}
              type="button"
              aria-expanded={createMenuOpen}
              onClick={() => {
                setMobileSearchOpen(false);
                setCreateMenuOpen((open) => !open);
              }}
            >
              <Icon name="plus" /> <span>Tạo</span>
            </button>
          ) : (
            <a
              className="nav-link mobile-nav-link contact-admin-mobile"
              href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent("Yêu cầu thêm nhạc hoặc sách vào DiNo")}`}
              onClick={() => setMobileSearchOpen(false)}
            >
              <Icon name="mail" /> <span>Liên hệ</span>
            </a>
          )}
        </nav>
        {isAdmin && createMenuOpen && (
          <div className="create-menu">
            <strong>Tạo nội dung mới</strong>
            <button type="button" onClick={() => openAddDialog("book")}>
              <Icon name="book" size={17} /> Thêm sách
            </button>
            <button type="button" onClick={() => openAddDialog("music")}>
              <Icon name="music" size={17} /> Thêm nhạc
            </button>
          </div>
        )}

        <section className="library-panel">
          <div className="sidebar-heading">
            <button
              className="library-title"
              type="button"
              onClick={() => {
                setActiveFilter("all");
                setQuery("");
              }}
            >
              <Icon name="library" />
              <span>Thư viện</span>
            </button>
          </div>
          <div className="library-submenu">
            <button
              className={activeFilter === "book" ? "selected" : ""}
              type="button"
              onClick={() => setActiveFilter("book")}
            >
              <Icon name="book" size={17} /> Kho sách
            </button>
            <button
              className={activeFilter === "music" ? "selected" : ""}
              type="button"
              onClick={() => setActiveFilter("music")}
            >
              <Icon name="music" size={17} /> Kho nhạc
            </button>
            {isAdmin ? (
              <div className="sidebar-admin-actions">
                <span>QUẢN TRỊ VIÊN</span>
                <button className="library-add-button" type="button" onClick={() => openAddDialog("book")}>
                  <Icon name="plus" size={17} /> Thêm sách
                </button>
                <button className="library-add-button" type="button" onClick={() => openAddDialog("music")}>
                  <Icon name="plus" size={17} /> Thêm nhạc
                </button>
                <button className="library-add-button" type="button" onClick={() => openCuratedComposer("music_album")}>
                  <Icon name="plus" size={17} /> Tạo album
                </button>
                <button className="library-add-button" type="button" onClick={() => openCuratedComposer("music_chart")}>
                  <Icon name="more" size={17} /> Tạo bảng xếp hạng
                </button>
              </div>
            ) : (
              <a
                className="contact-admin-link"
                href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent("Yêu cầu thêm nhạc hoặc sách vào DiNo")}`}
              >
                <Icon name="mail" size={17} /> Liên hệ quản trị viên
              </a>
            )}
          </div>
        </section>

        <a className="brand-lockup" href="#home" aria-label="DiNo - Trang chủ">
          <span className="brand-mark">D</span>
          <span className="brand-copy">
            <strong>DiNo</strong>
            <small>ÂM NHẠC &amp; SÁCH NÓI</small>
          </span>
        </a>
      </aside>

      <section className="main-column">
        <header className={`topbar ${mobileSearchOpen ? "search-mode" : ""}`}>
          <div className="history-buttons">
            <button className="round-button" type="button" aria-label="Quay lại"><span>‹</span></button>
            <button className="round-button" type="button" aria-label="Tiến tới" disabled><span>›</span></button>
          </div>
          <div className="desktop-topbar-controls">
            <button
              className="topbar-action"
              type="button"
              aria-current="page"
              onClick={() => {
                setActiveFilter("all");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <Icon name="home" size={16} /> Trang chủ
            </button>
            <div className="desktop-media-filters" role="tablist" aria-label="Lọc thư viện">
              {filterOptions.filter((filter) => filter.id !== "all").map((filter) => (
                <button
                  key={filter.id}
                  role="tab"
                  aria-selected={activeFilter === filter.id}
                  className={`filter-chip ${activeFilter === filter.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <label className={`search-box ${mobileSearchOpen ? "mobile-search-open" : ""}`}>
            <Icon name="search" size={18} />
            <input
              id="library-search"
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bạn muốn nghe gì hôm nay?"
              aria-label="Tìm trong thư viện"
            />
            {query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery("")}><Icon name="close" size={16} /></button>}
          </label>
        </header>

        <div className={`content-scroll${query ? " search-active" : ""}`}>
          <section className="welcome-section" aria-labelledby="welcome-title">
            <div className="welcome-copy">
              <p className="overline"><span className="sparkle">✳</span> KHÔNG GIAN ÂM THANH CỦA BẠN</p>
              <h1 id="welcome-title">Nghe theo<br /><span>cách của bạn.</span></h1>
              <p className="welcome-description">
                Âm nhạc và sách nói yêu thích, gom lại trong một thư viện chung dành cho bạn và gia đình.
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Icon name="play" size={15} /> Khám phá thư viện
              </button>
              <p className="welcome-footnote"><span className="tiny-dot" /> Nghe mọi lúc, trên mọi thiết bị</p>
            </div>
            <div className="hero-art" aria-hidden="true">
              <span className="hero-orbit" />
              <span className="hero-orbit orbit-two" />
              <span className="floating-note note-one">♪</span>
              <span className="floating-note note-two">♫</span>
              <span className="hero-disc">
                <span className="disc-ring ring-one" />
                <span className="disc-ring ring-two" />
                <span className="disc-label"><span>D</span><i>NGHE<br />THEO CÁCH<br />CỦA BẠN</i></span>
              </span>
              <span className="hero-caption">MUSIC <b>·</b> STORIES <b>·</b> YOU</span>
            </div>
          </section>
          <section id="library-section" className="library-section home-library">
            {isCloudLoading ? (
              <div className="empty-state">
                <span className="empty-icon"><Icon name="library" size={25} /></span>
                <h3>Đang đồng bộ thư viện</h3>
                <p>Đang tải nội dung được chia sẻ với tài khoản của bạn.</p>
              </div>
            ) : (
              <>
                {!query && userPlaylists.length > 0 && (
                  <section className="home-shelf" aria-labelledby="shelf-user-playlists">
                    <div className="shelf-heading">
                      <h2 id="shelf-user-playlists">Danh sách phát của tôi</h2>
                    </div>
                    {renderUserPlaylistCards()}
                  </section>
                )}
                {!query && albumLists.length > 0 && (
                  <>
                    {(["music_album", "book_album"] as const).map((kind) => {
                      const lists = albumLists.filter((list) => list.kind === kind);
                      return lists.length > 0 ? (
                        <section className="home-shelf" key={kind} aria-labelledby={`shelf-${kind}`}>
                          <div className="shelf-heading">
                            <h2 id={`shelf-${kind}`}>{kind === "music_album" ? "Album nhạc" : "Album sách nói"}</h2>
                          </div>
                          {renderCuratedListCards(lists)}
                        </section>
                      ) : null;
                    })}
                  </>
                )}
                {!query && chartLists.length > 0 && (
                  <>
                    {(["music_chart", "book_chart"] as const).map((kind) => {
                      const lists = chartLists.filter((list) => list.kind === kind);
                      return lists.length > 0 ? (
                        <section className="home-shelf" key={kind} aria-labelledby={`shelf-${kind}`}>
                          <div className="shelf-heading">
                            <h2 id={`shelf-${kind}`}>{kind === "music_chart" ? "Bảng xếp hạng âm nhạc" : "Bảng xếp hạng sách nói"}</h2>
                          </div>
                          {renderCuratedListCards(lists)}
                        </section>
                      ) : null;
                    })}
                  </>
                )}
                {homeShelves.length > 0 ? (
                  homeShelves.map((shelf) => (
                    <section className="home-shelf" key={shelf.id} aria-labelledby={`shelf-${shelf.id}`}>
                      <div className="shelf-heading">
                        <h2 id={`shelf-${shelf.id}`}>{shelf.title}</h2>
                        {shelf.id === "popular" && (
                          <span className="shelf-note">
                            {shelf.items.some((item) => item.playCount > 0)
                              ? "Xếp theo lượt phát của mọi người"
                              : "Chưa có lượt phát; kệ sẽ cập nhật khi mọi người nghe"}
                          </span>
                        )}
                      </div>
                      <div className="media-grid shelf-grid">{renderMediaCards(shelf.items)}</div>
                    </section>
                  ))
                ) : (
                  <div className="empty-state">
                    <span className="empty-icon"><Icon name={query ? "search" : "library"} size={25} /></span>
                    <h3>{query ? "Chưa tìm thấy nội dung" : "Kho nhạc và sách đang trống"}</h3>
                    <p>{query
                      ? "Thử một từ khóa khác nhé."
                      : "Nội dung bạn hoặc người thân thêm vào sẽ xuất hiện tại đây."}</p>
                  </div>
                )}
              </>
            )}
          </section>
          {actionMenuItem && (
            <div className="media-actions-menu" style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }} role="menu" aria-label={`Tùy chọn ${actionMenuItem.title}`}>
              <button type="button" role="menuitem" onClick={() => {
                setDetailsItem(actionMenuItem);
                setActionMenuItemId(null);
              }}>
                <Icon name="info" size={16} /> Xem thông tin bài
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={downloadingItemId === actionMenuItem.id}
                onClick={() => void downloadAudioItem(actionMenuItem)}
              >
                <Icon name="download" size={16} />
                {downloadingItemId === actionMenuItem.id ? "Đang tải xuống..." : "Tải xuống"}
              </button>
              <button type="button" role="menuitem" onClick={() => void toggleAudioState(actionMenuItem, "liked")}>
                <Icon name="heart" size={16} className={isLiked(actionMenuItem.id) ? "liked-icon" : ""} />
                {isLiked(actionMenuItem.id) ? "Bỏ thích" : "Thả tim"}
              </button>
              <button type="button" role="menuitem" onClick={() => void toggleAudioState(actionMenuItem, "saved")}>
                <Icon name="library" size={16} /> {isSaved(actionMenuItem.id) ? "Bỏ khỏi thư viện" : "Thêm vào thư viện"}
              </button>
              <button type="button" role="menuitem" onClick={() => void shareAudioItem(actionMenuItem)}>
                <Icon name="share" size={16} /> Chia sẻ
              </button>
              <button type="button" role="menuitem" onClick={() => openSocialShare(actionMenuItem, "zalo")}>
                <span className="social-share-mark zalo-mark">Z</span> Chia sẻ lên Zalo
              </button>
              <button type="button" role="menuitem" onClick={() => openSocialShare(actionMenuItem, "facebook")}>
                <span className="social-share-mark facebook-mark">f</span> Chia sẻ lên Facebook
              </button>
              <button type="button" role="menuitem" onClick={() => openPlaylistPicker(actionMenuItem)}>
                <Icon name="playlist" size={16} /> Thêm vào danh sách phát
              </button>
              <button type="button" role="menuitem" onClick={() => addToQueue(actionMenuItem)}>
                <Icon name="queue" size={16} /> Thêm vào danh sách chờ
              </button>
              <button type="button" role="menuitem" onClick={() => {
                setDetailsItem(actionMenuItem);
                setActionMenuItemId(null);
              }}>
                <Icon name="user" size={16} /> Chủ nhân bài này
              </button>
            </div>
          )}

          <footer className="page-footer">
            <span>DiNo <span className="footer-dot">✳</span> Nghe theo cách của bạn</span>
            <span>Âm thanh lưu trữ riêng tư trên thiết bị</span>
          </footer>
        </div>
      </section>

      <footer className="player-bar" aria-label="Trình phát">
        <div className="playing-track">
          {current ? (
            <>
              <span className={`mini-cover ${current.artwork}`}>{current.kind === "book" ? <Icon name="book" size={18} /> : <Icon name="music" size={18} />}</span>
              <span className="track-info">
                <strong>{isPreparingPlayback ? "Đang chuẩn bị âm thanh" : current.title}</strong>
                <span>{isPreparingPlayback ? playbackLoadingTitle : current.creator}</span>
              </span>
              <button
                className={`icon-button player-heart ${isLiked(current.id) ? "liked" : ""}`}
                type="button"
                aria-label={isLiked(current.id) ? "Bỏ khỏi danh sách yêu thích" : "Thêm vào danh sách yêu thích"}
                aria-pressed={isLiked(current.id)}
                onClick={() => void toggleAudioState(current, "liked")}
              >
                <Icon name="heart" size={17} />
              </button>
              <button
                className="icon-button mini-player-more"
                type="button"
                aria-label={`Tùy chọn ${current.title}`}
                aria-expanded={actionMenuItemId === current.id}
                onClick={(event) => toggleItemMenu(current, event.currentTarget)}
              >
                <Icon name="more" size={18} />
              </button>
            </>
          ) : (
            <>
              <span className="mini-cover mini-empty"><Icon name="music" size={18} /></span>
              <span className="track-info">
                <strong>{isPreparingPlayback ? "Đang chuẩn bị âm thanh" : "Chưa phát nội dung"}</strong>
                <span>{isPreparingPlayback ? playbackLoadingTitle : "Chọn tệp trong thư viện của bạn"}</span>
              </span>
            </>
          )}
          <button
           className="icon-button queue-toggle"
           type="button"
           aria-label={`Danh sách chờ${playQueue.length ? `, ${playQueue.length} mục` : ""}`}
           onClick={() => setQueueOpen(true)}
          >
           <Icon name="queue" size={18} />
           {playQueue.length > 0 && <span className="queue-count">{playQueue.length}</span>}
          </button>
        </div>
        <div className="player-center">
          <div className="player-controls">
            <button className={`player-control secondary-control ${isShuffle ? "control-active" : ""}`} type="button" aria-label={isShuffle ? "Tắt xáo trộn" : "Bật xáo trộn"} aria-pressed={isShuffle} onClick={() => setIsShuffle((enabled) => !enabled)}><Icon name="shuffle" size={17} /></button>
            <button className="player-control" type="button" aria-label="Bài trước" onClick={playPrevious}><Icon name="previous" size={18} /></button>
            <button
              className="main-play-button"
              type="button"
              aria-label={isPlaying ? "Tạm dừng" : "Phát"}
              disabled={!current}
              onClick={() => current && setIsPlaying((playing) => !playing)}
            >
              <Icon name={isPlaying ? "pause" : "play"} size={19} />
            </button>
            <button className="player-control" type="button" aria-label="Bài tiếp theo" onClick={playNext}><Icon name="next" size={18} /></button>
            <button className={`player-control secondary-control ${isRepeat ? "control-active" : ""}`} type="button" aria-label={isRepeat ? "Tắt lặp lại" : "Bật lặp lại"} aria-pressed={isRepeat} onClick={() => setIsRepeat((enabled) => !enabled)}><Icon name="repeat" size={17} /></button>
          </div>
          <div className="progress-row">
            <span>{formatTime(progress)}</span>
            <input
              aria-label="Tiến trình phát"
              type="range"
              min="0"
              max={duration || 100}
              value={duration ? Math.min(progress, duration) : 0}
              onChange={(event) => {
                const nextProgress = Number(event.target.value);
                setProgress(nextProgress);
                if (isAndroidNative) {
                  const session = nativeAudioSessionRef.current;
                  if (session && session.itemId === current?.id) {
                    void AudioPlayer.seek({
                      audioId: session.audioId,
                      timeInSeconds: nextProgress
                    }).catch(() => {
                      setNotice("Không thể tua nội dung đang phát.");
                    });
                  }
                } else if (audioRef.current) {
                  audioRef.current.currentTime = nextProgress;
                }
              }}
            />
            <span>{duration ? formatTime(duration) : "0:00"}</span>
          </div>
        </div>
        <div className="player-extras">
          <button className="icon-button" type="button" aria-label="Hẹn giờ tắt" onClick={() => setNotice("Hẹn giờ tắt sẽ có trong phiên bản tiếp theo.")}><Icon name="clock" size={18} /></button>
          <div className="volume-control"><Icon name="volume" size={18} /><input type="range" min="0" max="100" defaultValue="68" aria-label="Âm lượng" /></div>
        </div>
      </footer>

      {current?.audioUrl && !isAndroidNative && (
        <audio
          ref={audioRef}
          src={current.audioUrl}
          preload={isDataSaverEnabled ? "none" : "metadata"}
          onPlay={() => void handleAudioPlay()}
          onLoadedMetadata={onAudioLoaded}
          onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
          onEnded={handleAudioEnded}
          onError={(event) => {
            setIsPlaying(false);
            setNotice(getAudioPlaybackErrorMessage(event.currentTarget.error));
          }}
        />
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="add-modal app-settings-modal" role="dialog" aria-modal="true" aria-labelledby="app-settings-title">
            <div className="modal-heading">
              <div>
                <p className="overline">CÀI ĐẶT CÁ NHÂN</p>
                <h2 id="app-settings-title">Cài đặt DiNo</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng cài đặt" onClick={() => setSettingsOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            <div className="app-settings-group">
              <h3>Phát lại</h3>
              <label className="app-setting-row">
                <span>
                  <strong>Tiết kiệm dữ liệu</strong>
                  <small>Chỉ tải âm thanh khi bạn bắt đầu phát.</small>
                </span>
                <input
                  type="checkbox"
                  checked={isDataSaverEnabled}
                  onChange={(event) => setIsDataSaverEnabled(event.target.checked)}
                />
              </label>
              <label className="app-setting-row">
                <span>
                  <strong>Xáo trộn bài</strong>
                  <small>Phát nội dung theo thứ tự ngẫu nhiên.</small>
                </span>
                <input
                  type="checkbox"
                  checked={isShuffle}
                  onChange={(event) => setIsShuffle(event.target.checked)}
                />
              </label>
              <label className="app-setting-row">
                <span>
                  <strong>Lặp lại nội dung</strong>
                  <small>Tự phát lại nội dung đang nghe.</small>
                </span>
                <input
                  type="checkbox"
                  checked={isRepeat}
                  onChange={(event) => setIsRepeat(event.target.checked)}
                />
              </label>
            </div>
            <div className="app-settings-group">
              <h3>Thông báo</h3>
              <label className="app-setting-row">
                <span>
                  <strong>Nội dung mới trong kho</strong>
                  <small>{supportsNotifications
                    ? "Nhận thông báo khi có nhạc hoặc sách mới."
                    : "Trình duyệt này không hỗ trợ thông báo."}</small>
                </span>
                <input
                  type="checkbox"
                  checked={areNotificationsEnabled}
                  disabled={!supportsNotifications}
                  onChange={() => void toggleNewContentNotifications()}
                />
              </label>
            </div>
            <div className="app-settings-privacy">
              <strong>Quyền riêng tư</strong>
              <p>
                Kho chung chỉ dành cho tài khoản được mời. Thành viên có thể nghe và lưu nội dung;
                chỉ quản trị viên mới được thêm hoặc xóa tệp.
              </p>
            </div>
          </section>
        </div>
      )}

      {isAddOpen && isAdmin && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsAddOpen(false);
        }}>
          <section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <div className="modal-heading">
              <div>
                <p className="overline">THƯ VIỆN CỦA BẠN</p>
                <h2 id="add-title">{newItemKind === "book" ? "Thêm sách nói" : "Thêm nhạc"}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" onClick={() => setIsAddOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            <p className="modal-description">
              {authUser
                ? "Tải lên tệp âm thanh đã hoàn thiện để chia sẻ với những thành viên được mời vào kho DiNo."
                : "Chọn tệp âm thanh đã hoàn thiện để thêm vào thư viện trên thiết bị này."}
            </p>
            <form onSubmit={addAudio}>
              <label className="field-label" htmlFor="media-title">
                {newItemKind === "book" ? "Tên sách / chương truyện" : "Tên bài hát"}
              </label>
              <input
                className="form-input"
                id="media-title"
                name="title"
                placeholder={newItemKind === "book" ? "Ví dụ: Chương 1 - Khu rừng nhỏ" : "Ví dụ: Những ngày xanh"}
                required
              />
              <label className="field-label" htmlFor="media-creator">
                {newItemKind === "book" ? "Tác giả / người đọc" : "Nghệ sĩ"}
              </label>
              <input className="form-input" id="media-creator" name="creator" placeholder="Tên người tạo" required />
              <input type="hidden" name="kind" value={newItemKind} />
              <label className="file-drop" htmlFor="media-audio">
                <span className="file-icon"><Icon name="upload" size={22} /></span>
                <strong>Chọn tệp âm thanh đã hoàn thiện</strong>
                <span>MP3, WAV, M4A hoặc định dạng trình duyệt hỗ trợ</span>
                <input id="media-audio" name="audio" type="file" accept="audio/*" required />
              </label>
              <fieldset className="collection-fieldset">
                <legend>Chọn kệ chủ đề (không bắt buộc)</legend>
                <div className="collection-options">
                  {collectionOptions.map((collection) => (
                    <label className="collection-option" key={collection.id}>
                      <input
                        type="checkbox"
                        name="collections"
                        value={collection.id}
                        checked={newItemCollections.includes(collection.id)}
                        disabled={newItemKind === "music" && collection.id === "fairytale"}
                        onChange={(event) => {
                          setNewItemCollections((selected) => event.target.checked
                            ? [...selected, collection.id]
                            : selected.filter((item) => item !== collection.id));
                        }}
                      />
                      {collection.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="primary-button submit-button" type="submit" disabled={isUploading}>
                <Icon name="plus" size={18} /> {isUploading
                  ? "Đang tải lên…"
                  : authUser ? "Tải lên kho chung" : "Thêm vào thư viện"}
              </button>
            </form>
            <p className="privacy-hint"><span className="tiny-dot mint" />
              {authUser
                ? "Chỉ tài khoản được mời mới có thể truy cập nội dung."
                : "Tệp được giữ cục bộ trên thiết bị này."}
            </p>
          </section>
        </div>
      )}
      {curatedComposerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSavingCuratedList) setCuratedComposerOpen(false);
        }}>
          <section className="add-modal curated-composer-modal" role="dialog" aria-modal="true" aria-labelledby="curated-composer-title">
            <div className="modal-heading">
              <div>
                <p className="overline">QUẢN TRỊ THƯ VIỆN</p>
                <h2 id="curated-composer-title">{isChartKind(curatedComposerKind) ? "Tạo bảng xếp hạng" : "Tạo album"}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" disabled={isSavingCuratedList} onClick={() => setCuratedComposerOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            <p className="modal-description">
              Chọn nội dung trong kho dùng chung và sắp xếp thứ tự. Album và bảng xếp hạng sẽ hiển thị cho các thành viên đã đăng nhập.
            </p>
            <form className="curated-composer-form" onSubmit={(event) => void saveCuratedAudioList(event)}>
              <label className="field-label" htmlFor="curated-kind">Loại danh sách</label>
              <select
                className="form-input"
                id="curated-kind"
                value={curatedComposerKind}
                onChange={(event) => {
                  const option = curatedListKindOptions.find((entry) => entry.id === event.target.value);
                  if (!option) return;
                  setCuratedComposerKind(option.id);
                  setCuratedItemIds([]);
                }}
              >
                {curatedListKindOptions.map((option) => (
                  <option value={option.id} key={option.id}>{option.label}</option>
                ))}
              </select>
              <label className="field-label" htmlFor="curated-title">
                {isChartKind(curatedComposerKind) ? "Tên bảng xếp hạng" : "Tên album"}
              </label>
              <input
                className="form-input"
                id="curated-title"
                value={curatedTitle}
                onChange={(event) => setCuratedTitle(event.target.value)}
                maxLength={100}
                placeholder={isChartKind(curatedComposerKind) ? "Ví dụ: Top nhạc thư giãn" : "Ví dụ: Những bản nhạc yêu thích"}
                required
              />
              <label className="field-label" htmlFor="curated-description">Mô tả (không bắt buộc)</label>
              <textarea
                className="form-input curated-description-input"
                id="curated-description"
                value={curatedDescription}
                onChange={(event) => setCuratedDescription(event.target.value)}
                maxLength={500}
                placeholder="Viết vài dòng giới thiệu..."
              />
              <fieldset className="curated-items-fieldset">
                <legend>
                  Chọn {curatedComposerAudioKind === "music" ? "bài nhạc" : "sách nói"}
                  {" · "}Thứ tự chọn sẽ là thứ tự phát / xếp hạng
                </legend>
                {curatedSelectableItems.length > 0 ? (
                  <div className="curated-item-options">
                    {curatedSelectableItems.map((item) => (
                      <label className="curated-item-option" key={item.id}>
                        <input
                          type="checkbox"
                          checked={curatedItemIds.includes(item.id)}
                          onChange={(event) => setCuratedItemIds((selected) => event.target.checked
                            ? [...selected, item.id]
                            : selected.filter((itemId) => itemId !== item.id))}
                        />
                        <span className={`curated-item-cover ${item.artwork}`} />
                        <span className="curated-item-copy">
                          <strong>{item.title}</strong>
                          <small>{item.creator}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="curated-items-empty">
                    Chưa có {curatedComposerAudioKind === "music" ? "bài nhạc" : "sách nói"} trong kho chung. Hãy thêm nội dung trước.
                  </p>
                )}
              </fieldset>
              {selectedCuratedItems.length > 0 && (
                <div className="curated-order">
                  <h3>Thứ tự nội dung ({selectedCuratedItems.length})</h3>
                  <ol>
                    {selectedCuratedItems.map((item, index) => (
                      <li key={item.id}>
                        <span className="curated-order-number">{String(index + 1).padStart(2, "0")}</span>
                        <span className="curated-order-title">{item.title}</span>
                        <button
                          type="button"
                          aria-label={`Đưa ${item.title} lên`}
                          disabled={index === 0}
                          onClick={() => moveCuratedItem(item.id, -1)}
                        >
                          Lên
                        </button>
                        <button
                          type="button"
                          aria-label={`Đưa ${item.title} xuống`}
                          disabled={index === selectedCuratedItems.length - 1}
                          onClick={() => moveCuratedItem(item.id, 1)}
                        >
                          Xuống
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <button className="primary-button submit-button" type="submit" disabled={isSavingCuratedList || curatedSelectableItems.length === 0}>
                <Icon name={isChartKind(curatedComposerKind) ? "more" : "plus"} size={17} />
                {isSavingCuratedList
                  ? "Đang lưu..."
                  : isChartKind(curatedComposerKind) ? "Tạo bảng xếp hạng" : "Tạo album"}
              </button>
            </form>
          </section>
        </div>
      )}

      {selectedCuratedList && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedCuratedList(null);
        }}>
          <section className="add-modal curated-detail-modal" role="dialog" aria-modal="true" aria-labelledby="curated-detail-title">
            <div className="modal-heading">
              <div>
                <p className="overline">{getCuratedListTypeLabel(selectedCuratedList.kind)}</p>
                <h2 id="curated-detail-title">{selectedCuratedList.title}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" onClick={() => setSelectedCuratedList(null)}>
                <Icon name="close" />
              </button>
            </div>
            {selectedCuratedList.description && (
              <p className="modal-description">{selectedCuratedList.description}</p>
            )}
            {selectedCuratedListItems.length > 0 ? (
              <div className={`media-grid shelf-grid curated-detail-grid ${isChartKind(selectedCuratedList.kind) ? "ranked-media-grid" : ""}`}>
                {renderMediaCards(selectedCuratedListItems)}
              </div>
            ) : (
              <p className="curated-items-empty">Nội dung trong danh sách không còn trong kho dùng chung.</p>
            )}
          </section>
        </div>
      )}

      {detailsItem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetailsItem(null);
        }}>
          <section className="add-modal audio-details-modal" role="dialog" aria-modal="true" aria-labelledby="audio-details-title">
            <div className="modal-heading">
              <div>
                <p className="overline">{detailsItem.kind === "book" ? "THÔNG TIN SÁCH NÓI" : "THÔNG TIN BÀI HÁT"}</p>
                <h2 id="audio-details-title">{detailsItem.title}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" onClick={() => setDetailsItem(null)}>
                <Icon name="close" />
              </button>
            </div>
            <div className="audio-details-cover">
              <span className={`mini-cover ${detailsItem.artwork}`}>
                {detailsItem.kind === "book" ? <Icon name="book" size={27} /> : <Icon name="music" size={27} />}
              </span>
              <span>
                <strong>{detailsItem.title}</strong>
                <small>{detailsItem.kind === "book" ? "Sách nói" : "Bài hát"} · {detailsItem.creator}</small>
              </span>
            </div>
            <dl className="audio-details-list">
              <div><dt>{detailsItem.kind === "book" ? "Tác giả / người đọc" : "Nghệ sĩ"}</dt><dd>{detailsItem.creator}</dd></div>
              <div><dt>Chủ nhân tải lên</dt><dd>{getOwnerDisplayName(detailsItem)}</dd></div>
              <div><dt>Ngày thêm</dt><dd>{formatUploadDate(detailsItem.createdAt)}</dd></div>
              <div><dt>Lượt nghe</dt><dd>{detailsItem.playCount.toLocaleString("vi-VN")}</dd></div>
              <div><dt>Định dạng</dt><dd>{detailsItem.kind === "book" ? "Sách nói / chương truyện" : "Âm nhạc"}</dd></div>
            </dl>
            <p className="owner-privacy-note">Thông tin email cá nhân của người tải lên không được chia sẻ.</p>
            <div className="audio-details-actions">
              <button className={`outline-button ${isLiked(detailsItem.id) ? "liked" : ""}`} type="button" onClick={() => void toggleAudioState(detailsItem, "liked")}>
                <Icon name="heart" size={16} /> {isLiked(detailsItem.id) ? "Đã thích" : "Thả tim"}
              </button>
              <button className="outline-button" type="button" onClick={() => void shareAudioItem(detailsItem)}>
                <Icon name="share" size={16} /> Chia sẻ
              </button>
              <button
                className="outline-button"
                type="button"
                disabled={downloadingItemId === detailsItem.id}
                onClick={() => void downloadAudioItem(detailsItem)}
              >
                <Icon name="download" size={16} />
                {downloadingItemId === detailsItem.id ? "Đang tải..." : "Tải xuống"}
              </button>
            </div>
          </section>
        </div>
      )}

      {playlistItem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isAddingToPlaylist) setPlaylistItem(null);
        }}>
          <section className="add-modal playlist-picker-modal" role="dialog" aria-modal="true" aria-labelledby="playlist-picker-title">
            <div className="modal-heading">
              <div>
                <p className="overline">THƯ VIỆN CỦA BẠN</p>
                <h2 id="playlist-picker-title">Thêm vào danh sách phát</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" disabled={isAddingToPlaylist} onClick={() => setPlaylistItem(null)}>
                <Icon name="close" />
              </button>
            </div>
            <p className="modal-description">{playlistItem.title} · {playlistItem.creator}</p>
            <form onSubmit={(event) => void saveItemToPlaylist(event)}>
              <label className="field-label" htmlFor="existing-playlist">Chọn danh sách có sẵn</label>
              <select
                className="form-input"
                id="existing-playlist"
                value={selectedPlaylistId}
                onChange={(event) => setSelectedPlaylistId(event.target.value)}
                disabled={userPlaylists.length === 0 || Boolean(newPlaylistTitle.trim())}
              >
                <option value="">Chọn danh sách phát</option>
                {userPlaylists.map((playlist) => (
                  <option value={playlist.id} key={playlist.id}>{playlist.title}</option>
                ))}
              </select>
              <label className="field-label" htmlFor="new-playlist-title">Hoặc tạo danh sách mới</label>
              <input
                className="form-input"
                id="new-playlist-title"
                value={newPlaylistTitle}
                onChange={(event) => setNewPlaylistTitle(event.target.value)}
                maxLength={80}
                placeholder="Ví dụ: Nhạc nghe buổi tối"
              />
              <button className="primary-button submit-button" type="submit" disabled={isAddingToPlaylist || (!selectedPlaylistId && !newPlaylistTitle.trim())}>
                <Icon name="playlist" size={17} /> {isAddingToPlaylist ? "Đang thêm..." : "Thêm vào danh sách"}
              </button>
            </form>
          </section>
        </div>
      )}

      {viewingPlaylist && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setViewingPlaylistId(null);
        }}>
          <section className="add-modal curated-detail-modal" role="dialog" aria-modal="true" aria-labelledby="playlist-detail-title">
            <div className="modal-heading">
              <div>
                <p className="overline">DANH SÁCH PHÁT CỦA TÔI</p>
                <h2 id="playlist-detail-title">{viewingPlaylist.title}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" onClick={() => setViewingPlaylistId(null)}>
                <Icon name="close" />
              </button>
            </div>
            <p className="modal-description">{viewingPlaylistItems.length} nội dung trong danh sách phát.</p>
            {viewingPlaylistItems.length > 0 ? (
              <div className="media-grid shelf-grid curated-detail-grid">
                {renderMediaCards(viewingPlaylistItems)}
              </div>
            ) : (
              <p className="curated-items-empty">Nội dung trong danh sách không còn trong kho dùng chung.</p>
            )}
          </section>
        </div>
      )}

      {queueOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setQueueOpen(false);
        }}>
          <section className="add-modal queue-modal" role="dialog" aria-modal="true" aria-labelledby="queue-title">
            <div className="modal-heading">
              <div>
                <p className="overline">TRÌNH PHÁT</p>
                <h2 id="queue-title">Danh sách chờ ({queuedItems.length})</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" onClick={() => setQueueOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            {current && (
              <p className="queue-current-note">Đang phát: <strong>{current.title}</strong></p>
            )}
            {queuedItems.length > 0 ? (
              <ol className="queue-list">
                {queuedItems.map((item, index) => (
                  <li key={`${item.id}-${index}`}>
                    <span className="queue-position">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`curated-item-cover ${item.artwork}`} />
                    <span className="curated-item-copy">
                      <strong>{item.title}</strong>
                      <small>{item.creator}</small>
                    </span>
                    <button className="queue-play-button" type="button" onClick={() => {
                      setQueueOpen(false);
                      playQueuedItem(item);
                    }}>Phát</button>
                    <button className="queue-remove-button" type="button" aria-label={`Xóa ${item.title} khỏi danh sách chờ`} onClick={() => {
                      setPlayQueue((queue) => queue.filter((itemId) => itemId !== item.id));
                    }}>
                      <Icon name="close" size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="curated-items-empty">Chưa có nội dung trong danh sách chờ. Mở menu ba chấm trên bài hát hoặc sách để thêm vào đây.</p>
            )}
            {queuedItems.length > 0 && (
              <button className="text-button queue-clear-button" type="button" onClick={() => setPlayQueue([])}>
                Xóa toàn bộ danh sách chờ
              </button>
            )}
          </section>
        </div>
      )}

      {collectionEditItem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCollectionEditItem(null);
        }}>
          <section className="add-modal collection-modal" role="dialog" aria-modal="true" aria-labelledby="collection-title">
            <div className="modal-heading">
              <div>
                <p className="overline">SẮP XẾP THƯ VIỆN</p>
                <h2 id="collection-title">Chỉnh kệ chủ đề</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Đóng" onClick={() => setCollectionEditItem(null)}>
                <Icon name="close" />
              </button>
            </div>
            <p className="modal-description">{collectionEditItem.title} · {collectionEditItem.creator}</p>
            <fieldset className="collection-fieldset">
              <legend>Chọn các kệ phù hợp</legend>
              <div className="collection-options">
                {collectionOptions.map((collection) => (
                  <label className="collection-option" key={collection.id}>
                    <input
                      type="checkbox"
                      checked={collectionEditSelection.includes(collection.id)}
                      disabled={collectionEditItem.kind === "music" && collection.id === "fairytale"}
                      onChange={(event) => {
                        setCollectionEditSelection((selected) => event.target.checked
                          ? [...selected, collection.id]
                          : selected.filter((item) => item !== collection.id));
                      }}
                    />
                    {collection.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="collection-modal-actions">
              <button className="outline-button" type="button" onClick={() => setCollectionEditItem(null)}>
                Hủy
              </button>
              <button className="primary-button" type="button" disabled={isSavingCollections} onClick={() => void saveCollectionEdits()}>
                {isSavingCollections ? "Đang lưu…" : "Lưu danh mục"}
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
