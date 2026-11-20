import './clip-actions';
import { downloadClip } from './clip-buffer';

type PieceLink = {
  slug: string;
  title: string;
  modelName: string;
  posterUrl: string;
  clipUrl: string;
  address: string;
};
type State = 'paused' | 'loading' | 'playing' | 'blocked' | 'error';
type Move = 'button' | 'swipe' | 'auto';

const root = document.querySelector<HTMLElement>('[data-stage]')!;
const entries: PieceLink[] = JSON.parse(document.querySelector('#stage-catalogue')?.textContent ?? '[]');

if (entries.length) mountStage();

function mountStage() {
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const layout = root.parentElement!;
  // One media element for every Piece: Safari grants playback to the element that was tapped.
  const video = find<HTMLVideoElement>('video');
  const wrap = find('.st-artwrap');
  const art = find('.st-art');
  const poster = find<HTMLImageElement>('.st-poster');
  const title = find('.st-title');
  const model = find('.st-model');
  const count = find('[data-count]');
  const now = find('[data-now]');
  const length = find('[data-length]');
  const scrub = find('.st-scrub');
  const fill = find('.st-fill');
  const thumb = find('.st-thumbwrap');
  const play = find<HTMLButtonElement>('[data-play]');
  const next = find<HTMLButtonElement>('[data-step="1"]');
  const previous = find<HTMLButtonElement>('[data-step="-1"]');
  const again = find<HTMLButtonElement>('[data-repeat]');
  const copy = find<HTMLButtonElement>('[data-copy-address]');
  const save = find<HTMLAnchorElement>('[data-save-clip]');
  const stats = find<HTMLAnchorElement>('[data-stats]');

  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const cors = Boolean(root.dataset.cors);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const two = (number: number) => String(number).padStart(2, '0');
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${two(Math.floor(seconds % 60))}`;

  let index = Number(root.dataset.index);
  let want = false; // the listener asked for sound
  let repeat = false;
  let attempt = 0; // outdates callbacks that belong to an earlier Piece or tap
  let moving = false; // a Piece is sliding away
  let scrubbing = false;
  let shown = -1;
  let frame = 0;
  let waitTimer = 0;
  let objectUrl: string | undefined;

  /* ---------- What is on screen ---------- */

  function setState(state: State) {
    clearTimeout(waitTimer);
    const apply = () => {
      root.dataset.state = state;
      const verb = { playing: 'Pause', paused: 'Play', loading: 'Stop loading', blocked: 'Play', error: 'Retry' }[state];
      play.setAttribute('aria-label', `${verb} ${entries[index].title}`);
    };
    // A wait shorter than a fifth of a second never shows as loading.
    if (state === 'loading' && root.dataset.state !== 'loading') waitTimer = window.setTimeout(apply, 200);
    else apply();
  }

  const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 15);

  function paint(position = Math.min(duration(), video.currentTime)) {
    const total = duration();
    const part = position / total;
    fill.style.transform = `scaleX(${part})`;
    thumb.style.transform = `translateX(${part * 100}%)`;
    const second = Math.floor(position);
    if (second === shown) return;
    shown = second;
    now.textContent = clock(position);
    length.textContent = clock(total);
    scrub.setAttribute('aria-valuemax', String(Math.round(total)));
    scrub.setAttribute('aria-valuenow', String(second));
    scrub.setAttribute('aria-valuetext', `${clock(position)} of ${clock(total)}`);
  }

  // The line follows every frame only while sound is moving.
  function follow() {
    cancelAnimationFrame(frame);
    const step = () => {
      if (!scrubbing) paint();
      if (!video.paused) frame = requestAnimationFrame(step);
    };
    step();
  }

  const tints: (string | undefined)[] = [];
  function tint() {
    const at = entries.findIndex(({ posterUrl }) => posterUrl === poster.currentSrc);
    if (!cors || at === -1 || !poster.naturalWidth) return;
    if (!tints[at]) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 40;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(poster, 0, 0, 32, 40);
      const { data } = context.getImageData(0, 0, 32, 40);
      const sum = [0, 0, 0];
      let samples = 0;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 32; x++) {
          if (x > 0 && x < 31 && y > 0 && y < 39) continue;
          for (let channel = 0; channel < 3; channel++) sum[channel] += data[(y * 32 + x) * 4 + channel];
          samples++;
        }
      }
      tints[at] = `rgb(${sum.map((value) => Math.round(value / samples)).join(' ')})`;
    }
    if (at === index) layout.style.setProperty('--edge', tints[at]!);
  }
  poster.addEventListener('load', tint);

  function warmPoster(at: number) {
    const piece = entries[at];
    if (!piece) return;
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.src = piece.posterUrl;
  }

  function show() {
    const piece = entries[index];
    root.dataset.index = String(index);
    title.textContent = piece.title;
    model.textContent = piece.modelName;
    count.textContent = `${two(index + 1)} / ${two(entries.length)}`;
    if (poster.getAttribute('src') !== piece.posterUrl) poster.src = piece.posterUrl;
    if (tints[index]) layout.style.setProperty('--edge', tints[index]!);
    copy.dataset.copyAddress = piece.address;
    copy.setAttribute('aria-label', `Copy link to ${piece.title}`);
    save.href = piece.clipUrl;
    save.download = `bach-bench-${piece.slug}.mp4`;
    save.setAttribute('aria-label', `Download ${piece.title}`);
    stats.href = `/p/${piece.slug}/analytics/`;
    stats.setAttribute('aria-label', `Stats for ${piece.title}`);
    next.disabled = index === entries.length - 1;
    warmPoster(index + 1);
    warmPoster(index - 1);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: piece.title,
        artist: piece.modelName,
        album: 'Bach Bench',
        artwork: [{ src: piece.posterUrl, sizes: '1080x1350', type: 'image/jpeg' }],
      });
    }
  }

  // Reloading, sharing the address or coming back from Stats returns to this Piece.
  function remember() {
    const piece = entries[index];
    document.title = `${piece.title} · ${piece.modelName}`;
    const slash = location.pathname.endsWith('/') ? '/' : '';
    history.replaceState(history.state, '', `/p/${piece.slug}${slash}${location.search}`);
  }

  /* ---------- Sound ---------- */

  // The next Clip, fetched whole while the current one plays, so it starts at once.
  type Ahead = { index: number; controller: AbortController; blob?: Blob };
  let ahead: Ahead | undefined;
  const failed = new Set<number>();

  function bufferedTo() {
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime + 0.05 && video.buffered.end(i) >= video.currentTime)
        return video.buffered.end(i);
    }
    return video.currentTime;
  }

  function loadAhead() {
    const at = index + 1;
    if (!cors || connection?.saveData || !want || video.paused || ahead || !entries[at] || failed.has(at)) return;
    // The Piece being heard keeps the connection until it has time in reserve.
    if (bufferedTo() < Math.min(duration() - 0.05, video.currentTime + 5)) return;
    const entry: Ahead = { index: at, controller: new AbortController() };
    ahead = entry;
    downloadClip(entries[at].clipUrl, entry.controller.signal).then(
      (blob) => (entry.blob = blob),
      () => {
        if (ahead !== entry) return;
        ahead = undefined;
        failed.add(at);
      },
    );
  }

  function load() {
    art.removeAttribute('data-frame');
    const ready = ahead?.index === index ? ahead.blob : undefined;
    if (!ready) ahead?.controller.abort();
    ahead = undefined;
    const earlier = objectUrl;
    objectUrl = ready && URL.createObjectURL(ready);
    // Every other Clip plays straight from the Vault as it arrives.
    video.src = objectUrl ?? entries[index].clipUrl;
    if (earlier) URL.revokeObjectURL(earlier);
    paint(0);
  }

  function refused(mine: number) {
    return (error: DOMException) => {
      if (mine !== attempt || error.name === 'AbortError') return;
      want = false;
      setState(error.name === 'NotAllowedError' ? 'blocked' : 'error');
    };
  }

  function start() {
    const mine = ++attempt;
    want = true;
    if (video.error) load();
    if (video.ended) video.currentTime = 0;
    setState('loading');
    video.play().catch(refused(mine));
  }

  function stop() {
    attempt++;
    want = false;
    video.pause();
    setState('paused');
  }

  const toggle = () => (want ? stop() : start());

  function go(to: number) {
    if (!entries[to]) return;
    attempt++;
    index = to;
    shown = -1;
    load();
    show();
    remember();
    if (want) start();
    else setState('paused');
  }

  /* ---------- Moving between Pieces ---------- */

  function settle(ms = 220) {
    art.style.transition = ms ? `transform ${ms}ms var(--ease-out), opacity ${ms}ms var(--ease-out)` : 'none';
    art.style.transform = '';
    art.style.opacity = '';
  }

  function step(direction: 1 | -1, how: Move) {
    if (moving) return;
    const to = index + direction;
    if (!entries[to]) return settle();
    if (how === 'button' || calm.matches) {
      settle(0);
      go(to);
      return;
    }
    // The picture leaves on its last frame; the sound changes when it has gone.
    moving = true;
    video.pause();
    art.style.transition = 'transform 180ms var(--ease-out), opacity 180ms var(--ease-out)';
    art.style.transform = `translateX(${-direction * 60}%)`;
    art.style.opacity = '0';
    window.setTimeout(() => {
      moving = false;
      go(to);
      art.style.transition = 'none';
      art.style.transform = `translateX(${direction * 36}%)`;
      void art.offsetWidth;
      settle(240);
    }, 180);
  }

  function back() {
    if (video.currentTime > 3 || index === 0) {
      video.currentTime = 0;
      paint(0);
    } else step(-1, 'button');
  }

  /* ---------- The media element ---------- */

  function playing() {
    if (!want) return;
    art.dataset.frame = '';
    setState('playing');
    follow();
  }
  video.addEventListener('playing', playing);
  video.addEventListener('waiting', () => {
    if (want && !moving) setState('loading');
  });
  video.addEventListener('timeupdate', () => {
    if (want && !video.paused && video.readyState > 2 && root.dataset.state !== 'playing') playing();
    if (!scrubbing) paint();
    loadAhead();
  });
  video.addEventListener('progress', loadAhead);
  video.addEventListener('seeked', () => !scrubbing && paint());
  video.addEventListener('durationchange', () => {
    shown = -1;
    paint();
  });
  video.addEventListener('ended', () => {
    if (!want) return;
    if (repeat) start();
    else if (entries[index + 1]) step(1, 'auto');
    else {
      want = false;
      setState('paused');
    }
  });
  video.addEventListener('error', () => {
    if (!want) return;
    want = false;
    setState('error');
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', start);
    navigator.mediaSession.setActionHandler('pause', stop);
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1, 'button'));
    navigator.mediaSession.setActionHandler('previoustrack', back);
    navigator.mediaSession.setActionHandler('seekto', ({ seekTime }) => {
      if (seekTime !== undefined) video.currentTime = seekTime;
    });
  }

  /* ---------- Controls ---------- */

  play.addEventListener('click', toggle);
  next.addEventListener('click', () => step(1, 'button'));
  previous.addEventListener('click', back);
  again.addEventListener('click', () => {
    repeat = !repeat;
    again.setAttribute('aria-pressed', String(repeat));
  });

  // Tap the picture to play or pause; swipe it sideways for the next or previous Piece.
  {
    let pointer: number | undefined;
    let fromX = 0;
    let fromY = 0;
    let dragging = false;
    let last = { x: 0, time: 0 };
    let before = last;
    wrap.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointer = event.pointerId;
      fromX = event.clientX;
      fromY = event.clientY;
      dragging = false;
      last = before = { x: 0, time: event.timeStamp };
    });
    wrap.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointer || moving) return;
      const x = event.clientX - fromX;
      if (!dragging) {
        if (Math.abs(x) < 8 || Math.abs(x) < Math.abs(event.clientY - fromY)) return;
        dragging = true;
        wrap.setPointerCapture(event.pointerId);
      }
      before = last;
      last = { x, time: event.timeStamp };
      // Past the first or last Piece the picture resists.
      const end = (x > 0 && index === 0) || (x < 0 && index === entries.length - 1);
      art.style.transition = 'none';
      art.style.transform = `translateX(${end ? x * 0.25 : x}px)`;
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = undefined;
      const x = event.clientX - fromX;
      if (!dragging) {
        if (event.type === 'pointerup' && Math.hypot(x, event.clientY - fromY) < 8) toggle();
        return;
      }
      dragging = false;
      const speed = (last.x - before.x) / Math.max(1, last.time - before.time);
      if (event.type === 'pointerup' && (Math.abs(x) > wrap.clientWidth * 0.22 || Math.abs(speed) > 0.4))
        step(x < 0 ? 1 : -1, 'swipe');
      else settle();
    };
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);
  }

  // The line follows the finger; the Piece jumps when the finger lifts.
  scrub.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    scrub.setPointerCapture(event.pointerId);
    const finished = new AbortController();
    let part = 0;
    const move = ({ clientX }: PointerEvent) => {
      const box = scrub.getBoundingClientRect();
      part = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      paint(part * duration());
    };
    scrubbing = true;
    scrub.dataset.drag = '';
    move(event);
    scrub.addEventListener('pointermove', move, { signal: finished.signal });
    const end = () => {
      finished.abort();
      delete scrub.dataset.drag;
      scrubbing = false;
      video.currentTime = Math.min(duration() - 0.05, part * duration());
    };
    scrub.addEventListener('pointerup', end, { signal: finished.signal });
    scrub.addEventListener('pointercancel', end, { signal: finished.signal });
  });
  scrub.addEventListener('keydown', (event) => {
    const to = ({
      ArrowLeft: video.currentTime - 1, ArrowRight: video.currentTime + 1, Home: 0, End: duration(),
    } as Record<string, number>)[event.key];
    if (to === undefined || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    video.currentTime = Math.min(duration() - 0.05, Math.max(0, to));
    paint();
  });

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      step(1, 'button');
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      back();
    }
    if (event.code === 'Space' && event.target === document.body) {
      event.preventDefault();
      toggle();
    }
  });

  video.preload = connection?.saveData ? 'none' : 'auto';
  show();
  if (poster.complete) tint();
  play.disabled = false;
}

export {};
