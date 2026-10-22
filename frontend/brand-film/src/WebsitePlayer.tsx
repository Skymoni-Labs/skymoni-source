import {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Player, type PlayerRef} from '@remotion/player';
import {BrandFilm} from './open-space/Film';

// This entry lives in its own document so website SVG/button rules cannot
// change the composition, its controls, or the 1920 × 1080 layout.
const WebsitePlayer = () => {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    const pause = () => { if (document.hidden) ref.current?.pause(); };
    const leave = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === parent && event.data === 'skivu-film-pause') ref.current?.pause();
    };
    document.addEventListener('visibilitychange', pause);
    window.addEventListener('message', leave);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      window.removeEventListener('message', leave);
    };
  }, []);
  return <Player
    ref={ref}
    component={BrandFilm}
    inputProps={{}}
    durationInFrames={1200}
    compositionWidth={1920}
    compositionHeight={1080}
    fps={30}
    controls
    initiallyMuted
    showVolumeControls
    clickToPlay={false}
    doubleClickToFullscreen
    moveToBeginningWhenEnded={false}
    style={{width:'100%', height:'100%', aspectRatio:'16 / 9'}}
    renderPoster={() => <div className="film-poster">
      <span className="poster-orbit" aria-hidden="true"/>
      <span className="poster-brand">Skivu</span>
      <span className="poster-copy">一个属于你的 AI 空间。</span>
      <button type="button" onClick={event => ref.current?.play(event)} aria-label="播放 Skivu 宣传片，默认静音">▶ 播放宣传片 <small>00:40 · 默认静音</small></button>
    </div>}
    showPosterWhenUnplayed
  />;
};

const host = document.getElementById('skivu-film');
if (host) createRoot(host).render(<WebsitePlayer/>);
