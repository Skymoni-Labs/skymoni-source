// Stop the film when leaving the brand page, even if its iframe stays mounted.
(() => {
  const frame = document.getElementById('remotion-brand-player');
  const pause = () => {
    if (document.hidden || location.hash === '#beta') {
      frame?.contentWindow?.postMessage('skivu-film-pause', location.origin);
    }
  };
  window.addEventListener('hashchange', pause);
  document.addEventListener('visibilitychange', pause);
})();
