import { useMusic } from '../context/MusicContext';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import '../styles/music-player.css';

const R = 15;
const C = 2 * Math.PI * R;

export default function MusicPlayer() {
  const { currentSong, isPlaying, currentTime, duration, togglePlay, next, prev } = useMusic();

  const progress = duration > 0 ? (currentTime / duration) : 0;

  if (!currentSong) return null;

  return (
    <div className="music-player">
      <div className="music-player-info">
        <span className="music-player-title">{currentSong.title}</span>
        <span className="music-player-artist">{currentSong.artist}</span>
      </div>
      <div className="music-player-controls">
        <button className="music-player-btn" onClick={prev} title="上一首">
          <SkipBack size={16} />
        </button>
        <button className="music-player-btn music-player-play-btn" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
          {isPlaying && (
            <svg className="music-player-progress-ring" viewBox="0 0 34 34">
              <circle cx="17" cy="17" r={R} fill="none" stroke="#22c55e" strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                transform="rotate(-90 17 17)" />
            </svg>
          )}
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="music-player-btn" onClick={next} title="下一首">
          <SkipForward size={16} />
        </button>
      </div>
    </div>
  );
}