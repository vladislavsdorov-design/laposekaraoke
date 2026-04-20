import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelEntry,
  createQueueEntry,
  formatTrackLine,
  getSortedQueue,
  subscribeEntry,
  subscribeNowId,
  subscribeQueue,
} from "../lib/queue";
import {
  getOrCreateLocalId,
  readLocal,
  removeLocal,
  writeLocal,
} from "../lib/local";

const LOCAL_CLIENT_ID = "lapose_client_id";
const LOCAL_ACTIVE_ID = "lapose_active_request_id";
const PAGE_SIZE = 20;

function normalizeText(value, max) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function normalizeSong(raw) {
  if (!raw || !raw.Title || !raw.Artist) return null;
  const styles = String(raw.Styles || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const artist = String(raw.Artist || "").trim();
  const title = String(raw.Title || "").trim();
  const year = String(raw.Year || "").trim();
  const language = String(raw.Languages || "").trim();

  return {
    id: String(raw.Id || ""),
    title,
    artist,
    year,
    styles,
    language,
    search: `${artist} ${title}`.toLowerCase(),
  };
}

function songLabel(song) {
  if (!song) return "";
  const style = song.styles?.[0] || "";
  const meta = [song.year, style].filter(Boolean).join(", ");
  return meta
    ? `${song.artist} - ${song.title} (${meta})`
    : `${song.artist} - ${song.title}`;
}

export default function Home() {
  const [queueMap, setQueueMap] = useState({});
  const [nowId, setNowId] = useState(null);
  const [activeId, setActiveId] = useState(() => readLocal(LOCAL_ACTIVE_ID));
  const [activeEntry, setActiveEntry] = useState(null);
  const [name, setName] = useState("");
  const [track, setTrack] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const prevStatusRef = useRef(null);
  const nameInputRef = useRef(null);
  const trackInputRef = useRef(null);
  const [songs, setSongs] = useState([]);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState("");
  const [artistOptionsAll, setArtistOptionsAll] = useState([]);
  const [yearOptionsAll, setYearOptionsAll] = useState([]);
  const [styleOptionsAll, setStyleOptionsAll] = useState([]);
  const [trackQueryInput, setTrackQueryInput] = useState("");
  const [trackQuery, setTrackQuery] = useState("");
  const [artistFilter, setArtistFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [selectedSongId, setSelectedSongId] = useState("");
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 520px)").matches;
  });
  const [trackFinderOpen, setTrackFinderOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(max-width: 520px)").matches;
  });
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(max-width: 520px)").matches;
  });
  const searchCacheRef = useRef({
    q: "",
    artist: "",
    year: "",
    style: "",
    candidates: null,
  });
  const [filteredSongs, setFilteredSongs] = useState([]);
  const [searching, setSearching] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showTopArrow, setShowTopArrow] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersBusy, setFiltersBusy] = useState(false);
  const songListRef = useRef(null);
  const loadMoreRef = useRef(null);
  const [queueVisibleCount, setQueueVisibleCount] = useState(10);
  const [queueLoadingMore, setQueueLoadingMore] = useState(false);
  const queueListRef = useRef(null);
  const queueMoreRef = useRef(null);
  const [artistPickerOpen, setArtistPickerOpen] = useState(false);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [artistPickerQuery, setArtistPickerQuery] = useState("");
  const [stylePickerQuery, setStylePickerQuery] = useState("");
  const [yearPickerQuery, setYearPickerQuery] = useState("");
  const [artistPickerVisible, setArtistPickerVisible] = useState(60);
  const [stylePickerVisible, setStylePickerVisible] = useState(60);
  const [yearPickerVisible, setYearPickerVisible] = useState(80);
  const [pickedFlash, setPickedFlash] = useState(false);

  useEffect(() => {
    getOrCreateLocalId(LOCAL_CLIENT_ID);
  }, []);

  useEffect(() => subscribeQueue(setQueueMap), []);
  useEffect(() => subscribeNowId(setNowId), []);

  useEffect(() => {
    const unsub = subscribeEntry(activeId, setActiveEntry);
    return () => unsub();
  }, [activeId]);

  useEffect(() => {
    if (!trackFinderOpen) return;
    if (songs.length > 0) return;

    let mounted = true;
    async function loadSongs() {
      setSongsLoading(true);
      setSongsError("");
      try {
        const url = new URL("../../bazakarafansong.json", import.meta.url).href;
        const canUseWorker =
          typeof Worker !== "undefined" && typeof Blob !== "undefined";

        if (canUseWorker) {
          const workerSource = `
            self.onmessage = async (e) => {
              const url = e.data && e.data.url
              try {
                const res = await fetch(url)
                const text = await res.text()
                const json = JSON.parse(text)
                const raw = Array.isArray(json) ? json : []
                const out = []
                const artists = new Set()
                const years = new Set()
                const stylesSet = new Set()
                for (let i = 0; i < raw.length; i += 1) {
                  const r = raw[i]
                  if (!r || !r.Title || !r.Artist) continue
                  const artist = String(r.Artist || '').trim()
                  const title = String(r.Title || '').trim()
                  if (!artist || !title) continue
                  const styles = String(r.Styles || '')
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
                  const year = String(r.Year || '').trim()
                  const language = String(r.Languages || '').trim()
                  artists.add(artist)
                  if (year) years.add(year)
                  for (let s = 0; s < styles.length; s += 1) stylesSet.add(styles[s])
                  out.push({
                    id: String(r.Id || ''),
                    title,
                    artist,
                    year,
                    styles,
                    language,
                    search: (artist + ' ' + title).toLowerCase(),
                  })
                }
                const artistsArr = Array.from(artists).sort((a, b) => a.localeCompare(b))
                const yearsArr = Array.from(years).sort((a, b) => Number(b) - Number(a))
                const stylesArr = Array.from(stylesSet).sort((a, b) => a.localeCompare(b))
                self.postMessage({ ok: true, songs: out, artists: artistsArr, years: yearsArr, styles: stylesArr })
              } catch (err) {
                self.postMessage({ ok: false })
              }
            }
          `;
          const workerUrl = URL.createObjectURL(
            new Blob([workerSource], { type: "text/javascript" })
          );
          const worker = new Worker(workerUrl);
          const songsFromWorker = await new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("worker_timeout")),
              15000
            );
            worker.onmessage = (evt) => {
              clearTimeout(timeout);
              resolve(evt.data);
            };
            worker.onerror = () => {
              clearTimeout(timeout);
              reject(new Error("worker_error"));
            };
            worker.postMessage({ url });
          });
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
          if (songsFromWorker?.ok && Array.isArray(songsFromWorker.songs)) {
            if (mounted) {
              setSongs(songsFromWorker.songs);
              setArtistOptionsAll(
                Array.isArray(songsFromWorker.artists)
                  ? songsFromWorker.artists
                  : []
              );
              setYearOptionsAll(
                Array.isArray(songsFromWorker.years)
                  ? songsFromWorker.years
                  : []
              );
              setStyleOptionsAll(
                Array.isArray(songsFromWorker.styles)
                  ? songsFromWorker.styles
                  : []
              );
            }
          } else {
            throw new Error("worker_failed");
          }
        } else {
          const response = await fetch(url);
          if (!response.ok) throw new Error("not_ok");
          const json = await response.json();
          const raw = Array.isArray(json) ? json : [];
          const list = [];
          const artists = new Set();
          const years = new Set();
          const stylesSet = new Set();
          const chunkSize = 1500;
          for (let i = 0; i < raw.length; i += chunkSize) {
            const slice = raw.slice(i, i + chunkSize);
            for (const item of slice) {
              const normalized = normalizeSong(item);
              if (normalized) {
                list.push(normalized);
                artists.add(normalized.artist);
                if (normalized.year) years.add(normalized.year);
                for (let s = 0; s < normalized.styles.length; s += 1)
                  stylesSet.add(normalized.styles[s]);
              }
            }
            await new Promise((r) => setTimeout(r, 0));
          }
          if (mounted) {
            setSongs(list);
            setArtistOptionsAll(
              Array.from(artists).sort((a, b) => a.localeCompare(b))
            );
            setYearOptionsAll(
              Array.from(years).sort((a, b) => Number(b) - Number(a))
            );
            setStyleOptionsAll(
              Array.from(stylesSet).sort((a, b) => a.localeCompare(b))
            );
          }
        }
      } catch {
        if (mounted)
          setSongsError(
            "Baza utworow nie zaladowala sie. Mozesz wpisac utwor recznie."
          );
      } finally {
        if (mounted) setSongsLoading(false);
      }
    }

    loadSongs();
    return () => {
      mounted = false;
    };
  }, [trackFinderOpen, songs.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 520px)");
    const handler = (e) => {
      setIsMobile(e.matches);
      setTrackFinderOpen(!e.matches);
      setAdvancedOpen(!e.matches);
    };
    if (media.addEventListener) {
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
    media.addListener?.(handler);
    return () => media.removeListener?.(handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setTrackQuery(trackQueryInput), 160);
    return () => clearTimeout(t);
  }, [trackQueryInput]);

  const order = useMemo(
    () => getSortedQueue(queueMap, ["pending", "now"]),
    [queueMap]
  );
  const position = useMemo(() => {
    if (!activeId) return null;
    const idx = order.findIndex((x) => x.id === activeId);
    return idx >= 0 ? idx + 1 : null;
  }, [activeId, order]);
  const aheadCount = useMemo(
    () => (position && position > 1 ? position - 1 : 0),
    [position]
  );
  const songsById = useMemo(() => {
    const map = new Map();
    for (const item of songs) map.set(item.id, item);
    return map;
  }, [songs]);
  const selectedSong = useMemo(
    () => songsById.get(selectedSongId) || null,
    [songsById, selectedSongId]
  );
  const deferredQuery = useDeferredValue(trackQuery);

  useEffect(() => {
    let disposed = false;
    const t = setTimeout(async () => {
      if (!trackFinderOpen) {
        setFilteredSongs([]);
        setSearching(false);
        return;
      }
      if (songsLoading || songsError) {
        setFilteredSongs([]);
        setSearching(false);
        return;
      }

      const q = deferredQuery.trim().toLowerCase();
      const hasFilters = Boolean(artistFilter || yearFilter || styleFilter);
      const minChars = isMobile ? 2 : 2;
      const shouldSearch =
        (q.length >= minChars || hasFilters) && songs.length > 0;

      if (!shouldSearch) {
        searchCacheRef.current = {
          q: "",
          artist: artistFilter,
          year: yearFilter,
          style: styleFilter,
          candidates: null,
        };
        setFilteredSongs([]);
        setSearching(false);
        return;
      }

      setSearching(true);

      const cache = searchCacheRef.current;
      const canReuse =
        cache.candidates &&
        artistFilter === cache.artist &&
        yearFilter === cache.year &&
        styleFilter === cache.style &&
        q.startsWith(cache.q);

      const base = canReuse ? cache.candidates : songs;
      const candidates = [];
      const artistNeedle = artistFilter.trim().toLowerCase();
      const styleNeedle = styleFilter.trim().toLowerCase();

      const chunkSize = 2500;
      for (let start = 0; start < base.length; start += chunkSize) {
        const end = Math.min(start + chunkSize, base.length);
        for (let i = start; i < end; i += 1) {
          const song = base[i];
          if (artistNeedle && song.artist !== artistFilter) continue;
          if (yearFilter && song.year !== yearFilter) continue;
          if (styleNeedle && !song.styles.includes(styleFilter)) continue;
          if (q && !song.search.includes(q)) continue;
          candidates.push(song);
        }

        if (base.length > chunkSize) {
          await new Promise((r) => setTimeout(r, 0));
          if (disposed) return;
        }
      }

      searchCacheRef.current = {
        q,
        artist: artistFilter,
        year: yearFilter,
        style: styleFilter,
        candidates,
      };
      setFilteredSongs(candidates);
      setSearching(false);
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(t);
    };
  }, [
    trackFinderOpen,
    songsLoading,
    songsError,
    deferredQuery,
    artistFilter,
    yearFilter,
    styleFilter,
    songs,
    isMobile,
  ]);

  const displayedSongs = useMemo(
    () => filteredSongs.slice(0, visibleCount),
    [filteredSongs, visibleCount]
  );
  const hasMoreSongs = visibleCount < filteredSongs.length;

  const displayedQueue = useMemo(
    () => order.slice(0, queueVisibleCount),
    [order, queueVisibleCount]
  );
  const hasMoreQueue = queueVisibleCount < order.length;

  useEffect(() => {
    if (!hasMoreQueue) return;
    if (!queueListRef.current || !queueMoreRef.current) return;
    const root = queueListRef.current;
    const target = queueMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setQueueLoadingMore(true);
          setQueueVisibleCount((prev) => Math.min(prev + 10, order.length));
          setTimeout(() => setQueueLoadingMore(false), 180);
        }
      },
      { root, threshold: 0.2 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreQueue, order.length]);

  useEffect(() => {
    if (
      !trackFinderOpen ||
      !hasMoreSongs ||
      !songListRef.current ||
      !loadMoreRef.current
    )
      return;
    const root = songListRef.current;
    const target = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setLoadingMore(true);
          setVisibleCount((prev) =>
            Math.min(prev + PAGE_SIZE, filteredSongs.length)
          );
          setTimeout(() => setLoadingMore(false), 220);
        }
      },
      { root, threshold: 0.2 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [trackFinderOpen, hasMoreSongs, filteredSongs.length]);

  function scrollSongsTop() {
    songListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openArtistPicker() {
    if (!advancedOpen) return;
    setArtistPickerQuery("");
    setArtistPickerVisible(60);
    setArtistPickerOpen(true);
  }

  function openStylePicker() {
    if (!advancedOpen) return;
    setStylePickerQuery("");
    setStylePickerVisible(60);
    setStylePickerOpen(true);
  }

  function openYearPicker() {
    if (!advancedOpen) return;
    setYearPickerQuery("");
    setYearPickerVisible(80);
    setYearPickerOpen(true);
  }

  function clearArtist() {
    setArtistFilter("");
    setVisibleCount(PAGE_SIZE);
  }

  function clearStyle() {
    setStyleFilter("");
    setVisibleCount(PAGE_SIZE);
  }

  function clearYear() {
    setYearFilter("");
    setVisibleCount(PAGE_SIZE);
  }

  function clearPickedSong() {
    setSelectedSongId("");
    setTrack("");
    setTrackQueryInput("");
    setTrackQuery("");
    setPickedFlash(false);
    setVisibleCount(PAGE_SIZE);
  }

  const artistSuggestions = useMemo(() => {
    const needle = artistPickerQuery.trim().toLowerCase();
    const base = needle
      ? artistOptionsAll.filter((x) => x.toLowerCase().includes(needle))
      : artistOptionsAll;
    return base.slice(0, artistPickerVisible);
  }, [artistOptionsAll, artistPickerQuery, artistPickerVisible]);

  const styleSuggestions = useMemo(() => {
    const needle = stylePickerQuery.trim().toLowerCase();
    const base = needle
      ? styleOptionsAll.filter((x) => x.toLowerCase().includes(needle))
      : styleOptionsAll;
    return base.slice(0, stylePickerVisible);
  }, [styleOptionsAll, stylePickerQuery, stylePickerVisible]);

  const yearSuggestions = useMemo(() => {
    const needle = yearPickerQuery.trim().toLowerCase();
    const base = needle
      ? yearOptionsAll.filter((x) => x.toLowerCase().includes(needle))
      : yearOptionsAll;
    return base.slice(0, yearPickerVisible);
  }, [yearOptionsAll, yearPickerQuery, yearPickerVisible]);

  const activeFilters = useMemo(() => {
    const items = [];
    if (artistFilter)
      items.push({ key: "artist", label: "Artysta", value: artistFilter });
    if (yearFilter)
      items.push({ key: "year", label: "Rok", value: yearFilter });
    if (styleFilter)
      items.push({ key: "style", label: "Styl", value: styleFilter });
    return items;
  }, [artistFilter, yearFilter, styleFilter]);

  const effectiveStatus = useMemo(() => {
    if (!activeEntry) return null;
    if (nowId && activeId && nowId === activeId) return "now";
    return activeEntry.status || null;
  }, [activeEntry, activeId, nowId]);

  useEffect(() => {
    if (effectiveStatus === "now" && prevStatusRef.current !== "now") {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate([120, 80, 120]);
      }
      if (typeof window !== "undefined" && "Notification" in window) {
        const title = "LaPose Karaoke";
        const body = `Przygotuj sie: ${activeEntry?.name || "Gosc"} — ${
          activeEntry?.track || "Utwor"
        }`;
        if (Notification.permission === "granted") {
          new Notification(title, { body });
        } else if (Notification.permission === "default") {
          Notification.requestPermission().then((permission) => {
            if (permission === "granted") new Notification(title, { body });
          });
        }
      }
    }
    prevStatusRef.current = effectiveStatus;
  }, [effectiveStatus, activeEntry]);

  const canShowForm =
    !activeId ||
    !activeEntry ||
    ["done", "no_track", "cancelled", "skipped"].includes(effectiveStatus);

  async function submit() {
    setError("");
    setFieldError(null);
    const cleanName = normalizeText(name, 28);
    const cleanTrack = normalizeText(track, 96);
    const songFromChoice = selectedSong || null;
    const finalTrack = songFromChoice ? songLabel(songFromChoice) : cleanTrack;
    if (!cleanName) {
      setError("Wpisz imie albo pseudonim.");
      setFieldError("name");
      nameInputRef.current?.focus?.();
      return;
    }
    if (!finalTrack) {
      setError("Wpisz tytul utworu.");
      setFieldError("track");
      trackInputRef.current?.focus?.();
      return;
    }

    setLoading(true);
    try {
      const clientId = getOrCreateLocalId(LOCAL_CLIENT_ID);
      const newId = await createQueueEntry({
        clientId,
        name: cleanName,
        track: finalTrack,
        trackId: songFromChoice?.id || null,
        trackTitle: songFromChoice?.title || null,
        trackArtist: songFromChoice?.artist || null,
        trackYear: songFromChoice?.year || null,
        trackStyle: songFromChoice?.styles?.[0] || null,
        trackLanguage: songFromChoice?.language || null,
      });
      writeLocal(LOCAL_ACTIVE_ID, newId);
      setActiveId(newId);
      setName("");
      setTrack("");
      setFieldError(null);
      setTrackQueryInput("");
      setTrackQuery("");
      setSelectedSongId("");
    } catch {
      setError("Blad wysylki. Sprawdz internet i sprobuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  function resetToForm() {
    removeLocal(LOCAL_ACTIVE_ID);
    setActiveId(null);
    setActiveEntry(null);
    setError("");
  }

  async function cancelMySignup() {
    if (!activeId) return;
    setCancelLoading(true);
    setError("");
    try {
      await cancelEntry(activeId);
      resetToForm();
    } catch {
      setError("Nie udalo sie anulowac zapisu. Sprobuj ponownie.");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="mobileBg">
        <video
          className="mobileBgVideo"
          src="/back.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
        <div className="mobileBgOverlay" />
      </div>
      <div className="topbar">
        <div className="brand">
          <div className="brandMark">
            <img className="logostl" src="/logo.png" alt="logo" />
          </div>
          {/* <div className="brandSub">Kolejka karaoke</div> */}
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="cardTitle">Zapis na karaoke</div>

          {canShowForm ? (
            <div className="form">
              {effectiveStatus === "no_track" ? (
                <div className="noticeBox noticeWarn">
                  <div className="noticeTitle">
                    Przepraszamy, ale niestety nie ma takiego utworu
                  </div>
                  <div className="noticeText">
                    To zgloszenie zostalo oznaczone jako "Brak utworu". Wybierz
                    inny utwor i wyslij nowe zgloszenie.
                  </div>
                </div>
              ) : null}
              <label className="label" htmlFor="name">
                Imie / pseudonim
              </label>
              <input
                id="name"
                className={`input ${fieldError === "name" ? "inputGreen" : ""}`}
                ref={nameInputRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldError === "name") setFieldError(null);
                }}
                placeholder="Np. DJ Max"
                autoComplete="nickname"
                inputMode="text"
              />

              <label className="label" htmlFor="track">
                Utwor / muzyka
              </label>
              <input
                id="track"
                className={`input ${
                  fieldError === "track" ? "inputGreen" : ""
                }`}
                ref={trackInputRef}
                value={track}
                onChange={(e) => {
                  const value = e.target.value;
                  setTrack(value);
                  setTrackQueryInput(value);
                  setVisibleCount(PAGE_SIZE);
                  if (fieldError === "track") setFieldError(null);
                  if (
                    selectedSongId &&
                    selectedSong &&
                    value !== songLabel(selectedSong)
                  ) {
                    setSelectedSongId("");
                  }
                }}
                placeholder="Np. The Weeknd - Blinding Lights"
                inputMode="text"
              />

              <div className="trackFinder">
                <div className="trackFinderHeader">
                  <div className="trackFinderTitle">
                    Podpowiedzi z bazy utworow
                  </div>
                  <div className="trackFinderHeaderBtns">
                    <button
                      className="btn btnSmall btnGhost"
                      type="button"
                      onClick={() => {
                        setTrackFinderOpen((v) => !v);
                        setVisibleCount(PAGE_SIZE);
                        setShowTopArrow(false);
                      }}
                    >
                      {trackFinderOpen ? "Zwin" : "Pokaz"}
                    </button>
                    <button
                      className="btn btnSmall"
                      type="button"
                      onClick={() => {
                        if (!trackFinderOpen) return;
                        setFiltersBusy(true);
                        setAdvancedOpen((v) => !v);
                        setTimeout(() => setFiltersBusy(false), 260);
                      }}
                      disabled={!trackFinderOpen || filtersBusy}
                    >
                      {filtersBusy ? "..." : advancedOpen ? "Prosto" : "Filtry"}
                    </button>
                  </div>
                </div>

                {trackFinderOpen ? (
                  <>
                    <div className="trackFilters">
                      <input
                        className="input"
                        value={trackQueryInput}
                        onChange={(e) => {
                          setTrackQueryInput(e.target.value);
                          setVisibleCount(PAGE_SIZE);
                        }}
                        placeholder="Szukaj po artyscie lub tytule"
                        inputMode="text"
                      />
                      {advancedOpen ? (
                        <>
                          <button
                            className="selectBtn"
                            type="button"
                            onClick={openArtistPicker}
                          >
                            {artistFilter
                              ? `Artysta: ${artistFilter}`
                              : "Artysta: wszyscy"}
                          </button>
                          <button
                            className="selectBtn"
                            type="button"
                            onClick={openYearPicker}
                          >
                            {yearFilter
                              ? `Rok: ${yearFilter}`
                              : "Rok: wszystkie"}
                          </button>
                          <button
                            className="selectBtn"
                            type="button"
                            onClick={openStylePicker}
                          >
                            {styleFilter
                              ? `Styl: ${styleFilter}`
                              : "Styl: wszystkie"}
                          </button>
                        </>
                      ) : null}
                    </div>

                    {advancedOpen ? (
                      <div className="chipRow">
                        {activeFilters.length ? (
                          <>
                            {activeFilters.map((f) => (
                              <button
                                key={f.key}
                                type="button"
                                className="chip"
                                onClick={() => {
                                  if (f.key === "artist") clearArtist();
                                  if (f.key === "year") clearYear();
                                  if (f.key === "style") clearStyle();
                                }}
                              >
                                {f.label}: {f.value}{" "}
                                <span className="chipX">×</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="chip chipGhost"
                              onClick={() => {
                                clearArtist();
                                clearYear();
                                clearStyle();
                              }}
                            >
                              Wyczyść wszystko
                            </button>
                          </>
                        ) : (
                          <div className="hint">Filtry: brak</div>
                        )}
                      </div>
                    ) : null}

                    {selectedSong ? (
                      <div
                        className={`pickedBox ${
                          pickedFlash ? "pickedBoxFlash" : ""
                        }`}
                      >
                        <div className="pickedTitle">Wybrany utwor</div>
                        <div className="pickedMain">
                          {selectedSong.artist} - {selectedSong.title}
                        </div>
                        <div className="pickedMeta">
                          {selectedSong.year || "—"} |{" "}
                          {selectedSong.styles.join(", ") || "—"} |{" "}
                          {selectedSong.language || "—"}
                        </div>
                        <button
                          className="btn btnSmall btnGhost"
                          type="button"
                          onClick={clearPickedSong}
                        >
                          Zmien / wyczysc
                        </button>
                      </div>
                    ) : null}

                    {songsError ? (
                      <div className="hint">{songsError}</div>
                    ) : null}
                    {songsLoading ? (
                      <div className="skeletonBlock">
                        <div className="hint">Ladowanie bazy utworow...</div>
                        <div className="skeletonList">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="skeletonRow"></div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {searching && !songsLoading ? (
                      <div className="hint">Szukam...</div>
                    ) : null}

                    {!songsLoading && !songsError ? (
                      <div className="songListWrap">
                        <div className="hint">
                          Znaleziono:{" "}
                          <span className="mono">{filteredSongs.length}</span> |
                          Pokazano:{" "}
                          <span className="mono">{displayedSongs.length}</span>
                        </div>
                        <div
                          className="songList"
                          ref={songListRef}
                          onScroll={(e) =>
                            setShowTopArrow(e.currentTarget.scrollTop > 180)
                          }
                        >
                          {filteredSongs.length === 0 ? (
                            <div className="hint">
                              {trackQueryInput.trim().length < 2 &&
                              !artistFilter &&
                              !yearFilter &&
                              !styleFilter
                                ? "Wpisz minimum 2 znaki, aby wyszukac."
                                : "Brak wynikow dla wybranych filtrow."}
                            </div>
                          ) : (
                            displayedSongs.map((song, idx) => (
                              <button
                                key={song.id}
                                className={`songItem songItemAnimate ${
                                  selectedSongId === song.id
                                    ? "songItemActive"
                                    : ""
                                }`}
                                type="button"
                                style={{
                                  animationDelay: `${Math.min(idx, 10) * 18}ms`,
                                }}
                                onClick={() => {
                                  setSelectedSongId(song.id);
                                  const label = songLabel(song);
                                  setTrack(label);
                                  setTrackQueryInput(label);
                                  setTrackQuery(label);
                                  setPickedFlash(true);
                                  setTimeout(() => setPickedFlash(false), 320);
                                }}
                              >
                                <div className="songMain">
                                  {song.artist} - {song.title}
                                </div>
                                <div className="songMeta">
                                  {song.year || "—"} |{" "}
                                  {song.styles.join(", ") || "—"} |{" "}
                                  {song.language || "—"}
                                </div>
                              </button>
                            ))
                          )}
                          <div
                            ref={loadMoreRef}
                            className="songListSentinel"
                          ></div>
                        </div>

                        {hasMoreSongs || loadingMore ? (
                          <div className="hint">
                            {loadingMore
                              ? "Laduje wiecej..."
                              : "Przewin w dol, aby zaladowac wiecej."}
                          </div>
                        ) : null}

                        {showTopArrow ? (
                          <button
                            className="backToTopBtn"
                            type="button"
                            onClick={scrollSongsTop}
                          >
                            ↑
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="hint">
                    {isMobile
                      ? 'Na telefonie podpowiedzi sa domyslnie zwinięte. Kliknij "Pokaz".'
                      : 'Kliknij "Pokaz", aby wybrac utwor z listy.'}
                  </div>
                )}
              </div>

              {artistPickerOpen ? (
                <div className="pickerOverlay" role="dialog" aria-modal="true">
                  <div className="pickerSheet">
                    <div className="pickerHeader">
                      <div className="pickerTitle">Wybierz artystę</div>
                      <button
                        className="btn btnSmall btnGhost"
                        type="button"
                        onClick={() => setArtistPickerOpen(false)}
                      >
                        Zamknij
                      </button>
                    </div>
                    <input
                      className="input"
                      value={artistPickerQuery}
                      onChange={(e) => {
                        setArtistPickerQuery(e.target.value);
                        setArtistPickerVisible(60);
                      }}
                      placeholder="Szukaj artysty..."
                      inputMode="text"
                    />
                    <div
                      className="pickerList"
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (
                          el.scrollTop + el.clientHeight >=
                          el.scrollHeight - 60
                        ) {
                          setArtistPickerVisible((v) => v + 60);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="pickerItem"
                        onClick={() => {
                          setArtistFilter("");
                          setVisibleCount(PAGE_SIZE);
                          setArtistPickerOpen(false);
                        }}
                      >
                        Wszyscy artysci
                      </button>
                      {artistSuggestions.map((x) => (
                        <button
                          key={x}
                          type="button"
                          className={`pickerItem ${
                            x === artistFilter ? "pickerItemActive" : ""
                          }`}
                          onClick={() => {
                            setArtistFilter(x);
                            setVisibleCount(PAGE_SIZE);
                            setArtistPickerOpen(false);
                          }}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {stylePickerOpen ? (
                <div className="pickerOverlay" role="dialog" aria-modal="true">
                  <div className="pickerSheet">
                    <div className="pickerHeader">
                      <div className="pickerTitle">Wybierz styl</div>
                      <button
                        className="btn btnSmall btnGhost"
                        type="button"
                        onClick={() => setStylePickerOpen(false)}
                      >
                        Zamknij
                      </button>
                    </div>
                    <input
                      className="input"
                      value={stylePickerQuery}
                      onChange={(e) => {
                        setStylePickerQuery(e.target.value);
                        setStylePickerVisible(60);
                      }}
                      placeholder="Szukaj stylu..."
                      inputMode="text"
                    />
                    <div
                      className="pickerList"
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (
                          el.scrollTop + el.clientHeight >=
                          el.scrollHeight - 60
                        ) {
                          setStylePickerVisible((v) => v + 60);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="pickerItem"
                        onClick={() => {
                          setStyleFilter("");
                          setVisibleCount(PAGE_SIZE);
                          setStylePickerOpen(false);
                        }}
                      >
                        Wszystkie style
                      </button>
                      {styleSuggestions.map((x) => (
                        <button
                          key={x}
                          type="button"
                          className={`pickerItem ${
                            x === styleFilter ? "pickerItemActive" : ""
                          }`}
                          onClick={() => {
                            setStyleFilter(x);
                            setVisibleCount(PAGE_SIZE);
                            setStylePickerOpen(false);
                          }}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {yearPickerOpen ? (
                <div className="pickerOverlay" role="dialog" aria-modal="true">
                  <div className="pickerSheet">
                    <div className="pickerHeader">
                      <div className="pickerTitle">Wybierz rok</div>
                      <button
                        className="btn btnSmall btnGhost"
                        type="button"
                        onClick={() => setYearPickerOpen(false)}
                      >
                        Zamknij
                      </button>
                    </div>
                    <input
                      className="input"
                      value={yearPickerQuery}
                      onChange={(e) => {
                        setYearPickerQuery(e.target.value);
                        setYearPickerVisible(80);
                      }}
                      placeholder="Szukaj roku..."
                      inputMode="numeric"
                    />
                    <div
                      className="pickerList"
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        if (
                          el.scrollTop + el.clientHeight >=
                          el.scrollHeight - 60
                        ) {
                          setYearPickerVisible((v) => v + 80);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="pickerItem"
                        onClick={() => {
                          setYearFilter("");
                          setVisibleCount(PAGE_SIZE);
                          setYearPickerOpen(false);
                        }}
                      >
                        Wszystkie lata
                      </button>
                      {yearSuggestions.map((x) => (
                        <button
                          key={x}
                          type="button"
                          className={`pickerItem ${
                            x === yearFilter ? "pickerItemActive" : ""
                          }`}
                          onClick={() => {
                            setYearFilter(x);
                            setVisibleCount(PAGE_SIZE);
                            setYearPickerOpen(false);
                          }}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {error ? <div className="error">{error}</div> : null}

              <button
                className="btn"
                type="button"
                onClick={submit}
                disabled={loading}
              >
                {loading ? "Wysylanie..." : "Wyslij"}
              </button>
            </div>
          ) : (
            <div className="status">
              {effectiveStatus === "pending" ? (
                <>
                  <div className="statusTitle">Jestes w kolejce</div>
                  <div className="statusBig">
                    {position ? `№${position}` : "—"}
                  </div>
                  <div className="statusText">
                    Imie:{" "}
                    <span className="mono">{activeEntry?.name || "—"}</span>
                  </div>
                  <div className="statusText">
                    Utwor:{" "}
                    <span className="mono">{formatTrackLine(activeEntry)}</span>
                  </div>
                  <div className="statusText">
                    Przed toba: <span className="mono">{aheadCount}</span>
                  </div>
                  <div className="hint">
                    Kolejka aktualizuje sie automatycznie.
                  </div>
                  <button
                    className="btn btnGhost"
                    type="button"
                    onClick={cancelMySignup}
                    disabled={cancelLoading}
                  >
                    {cancelLoading ? "Anulowanie..." : "Anuluj zapis"}
                  </button>
                </>
              ) : null}

              {effectiveStatus === "now" ? (
                <>
                  <div className="statusTitle">
                    Przygotuj sie - zaraz wchodzisz na scene
                  </div>
                  <div className="statusBig">TERAZ</div>
                  <div className="statusText">
                    <span className="mono">{activeEntry?.name}</span> —{" "}
                    <span className="mono">{formatTrackLine(activeEntry)}</span>
                  </div>
                </>
              ) : null}

              {effectiveStatus === "done" ? (
                <>
                  <div className="statusTitle">Gotowe</div>
                  <div className="statusText">
                    Jesli chcesz, mozesz zapisac sie ponownie.
                  </div>
                  <button className="btn" type="button" onClick={resetToForm}>
                    Zapisz sie ponownie
                  </button>
                </>
              ) : null}

              {effectiveStatus === "skipped" ? (
                <>
                  <div className="statusTitle">Zostales pominiety</div>
                  <div className="statusText">
                    Zapisz sie ponownie, gdy bedziesz gotowy.
                  </div>
                  <button className="btn" type="button" onClick={resetToForm}>
                    Zapisz sie ponownie
                  </button>
                </>
              ) : null}

              {effectiveStatus === "cancelled" ? (
                <>
                  <div className="statusTitle">Zapis anulowany</div>
                  <button className="btn" type="button" onClick={resetToForm}>
                    Zapisz sie ponownie
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className="card">
          <div className="cardTitle">Aktualna kolejka</div>
          <div className="queueMini queueMiniScroll" ref={queueListRef}>
            {order.length === 0 ? (
              <div className="hint">Na razie pusto.</div>
            ) : (
              displayedQueue.map((x, idx) => (
                <div
                  key={x.id}
                  className={[
                    "queueRow",
                    x.status === "now" || x.id === nowId ? "queueRowNow" : "",
                    x.id === activeId ? "queueRowMe" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="queueNum">{idx + 1}</div>
                  <div className="queueMain">
                    <div className="queueName">{x.name || "—"}</div>
                    <div className="queueTrack">{formatTrackLine(x)}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={queueMoreRef} className="queueSentinel"></div>
          </div>
          <div className="hint">
            Pokazuje: {Math.min(queueVisibleCount, order.length)} /{" "}
            {order.length}.
            {hasMoreQueue || queueLoadingMore ? (
              <>
                {" "}
                {queueLoadingMore
                  ? "Laduje wiecej..."
                  : "Przewin w dol, aby zaladowac wiecej."}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="footer">
        <span className="footerBrand">LaPose</span>
        <span className="footerDot">•</span>
        <span>Karaoke</span>
        <span className="footerDot">•</span>
        <span>Wszelkie prawa zastrzezone®</span>
      </footer>
    </div>
  );
}
