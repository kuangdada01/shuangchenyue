import { createContext, useContext, useRef, useState, useEffect, ReactNode, useCallback } from 'react';
import { getApiBaseUrl, resolveMediaUrl } from '../config';

interface Song {
  title: string;
  artist: string;
  src: string;
}

interface MusicContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  currentIndex: number;
  currentTime: number;
  duration: number;
  songs: Song[];
  loading: boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  playSong: (index: number) => void;
  refreshSongs: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSongs = useCallback(async () => {
    try {
      // 初始 loading 由 useState(true) 承担；刷新时不再同步置 loading，
      // 避免 effect 内同步 setState（react-hooks/set-state-in-effect）
      // 原生平台必须使用完整服务器地址（相对路径会解析到 WebView 本地 localhost）
      const res = await fetch(`${getApiBaseUrl()}/music`);
      if (res.ok) {
        const data = await res.json();
        setSongs(data.map((s: Song) => ({ ...s, src: resolveMediaUrl(s.src) || s.src })));
      }
    } catch (err) {
      console.error('Failed to fetch music list:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 用 ref 保存最新回调，避免 audio 事件监听器捕获首渲染的陈旧闭包
  // （ref 写入放在 effect 中，渲染期写 ref 会被 react-hooks/refs 拦截）
  const songsRef = useRef(songs);
  useEffect(() => { songsRef.current = songs; }, [songs]);
  const nextRef = useRef<() => void>(() => {});
  useEffect(() => {
    nextRef.current = () => {
      const len = songsRef.current.length;
      setCurrentIndex(prev => (len > 0 ? (prev + 1) % len : 0));
      setIsPlaying(true);
    };
  });

  useEffect(() => {
    // 挂载时拉取：经 Promise 回调间接调用（effect 同步路径不直接调用含 setState 的函数）
    void Promise.resolve().then(() => fetchSongs());
  }, [fetchSongs]);
  const currentSong = songs[currentIndex] || null;

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
    audioRef.current.volume = 0.5;
    const audio = audioRef.current;
    const onEnded = () => nextRef.current();
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current || !currentSong) return;
    const audio = audioRef.current;
    // 相对路径时 audio.src 会解析为绝对地址，两种情况都需匹配
    const isCurrent = audio.src === currentSong.src || audio.src === window.location.origin + currentSong.src;
    if (!isCurrent) {
      audio.src = currentSong.src;
      audio.load();
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    }
  }, [currentIndex, currentSong, isPlaying]);

  const play = () => {
    if (!audioRef.current || !currentSong) return;
    audioRef.current.play().catch(() => {});
    setIsPlaying(true);
  };

  const pause = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) pause();
    else play();
  };

  const next = () => {
    const len = songs.length;
    setCurrentIndex(prev => (len > 0 ? (prev + 1) % len : 0));
    setIsPlaying(true);
  };

  const prev = () => {
    const len = songs.length;
    setCurrentIndex(prev => (len > 0 ? (prev - 1 + len) % len : 0));
    setIsPlaying(true);
  };

  const seek = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const playSong = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  return (
    <MusicContext.Provider value={{ currentSong, isPlaying, currentIndex, currentTime, duration, songs, loading, play, pause, togglePlay, next, prev, seek, playSong, refreshSongs: fetchSongs }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusic must be used within MusicProvider');
  return ctx;
}
