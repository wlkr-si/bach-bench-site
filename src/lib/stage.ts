import { allowPlayback, canStreamClip, downloadClip } from './clip-buffer';

type PieceLink = {
  slug: string;
  title: string;
  modelName: string;
  posterUrl: string;
  clipUrl: string;
  address: string;
};

const root = document.querySelector<HTMLElement>('[data-stage]')!;
const template = document.querySelector<HTMLTemplateElement>('#stage-slide');
const entries: PieceLink[] = JSON.parse(document.querySelector('#stage-catalogue')?.textContent ?? '[]');

if (template && entries.length) mountStage(template);

function mountStage(template: HTMLTemplateElement) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pageScroll = matchMedia('(max-height: 500px), (max-width: 600px) and (max-height: 580px)');
  const count = (number: number) => String(number).padStart(2, '0');
  let current = Number(root.dataset.initial);
  const initial = current;
  let flowing = false;
  let frame = 0;
  let playback = 0;
  let unlocked = false;
  let objectUrl: string | undefined;

  const slides = entries.map((piece, index) => {
    const section = index === initial
      ? root.querySelector<HTMLElement>('.st-slide')!
      : template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const toggle = section.querySelector<HTMLButtonElement>('[data-play]')!;
    const poster = section.querySelector<HTMLImageElement>('.st-poster')!;

    if (index !== initial) {
      section.dataset.index = String(index);
      section.setAttribute('aria-label', piece.title);
      section.querySelector('.st-model')!.textContent = piece.modelName;
      section.querySelector('.st-title')!.textContent = piece.title;
      section.querySelector('.st-count')!.textContent = `${count(index + 1)} / ${count(entries.length)}`;
      toggle.setAttribute('aria-label', `Play ${piece.title}`);
      section.querySelector<HTMLButtonElement>('[data-step="-1"]')!.disabled = index === 0;
      section.querySelector<HTMLButtonElement>('[data-step="1"]')!.disabled = index === entries.length - 1;
      const download = section.querySelector<HTMLAnchorElement>('[data-save-clip]')!;
      download.href = piece.clipUrl;
      download.download = `bach-bench-${piece.slug}.mp4`;
      download.setAttribute('aria-label', `Download ${piece.title}`);
      const copy = section.querySelector<HTMLButtonElement>('[data-copy-address]')!;
      copy.dataset.copyAddress = piece.address;
      copy.setAttribute('aria-label', `Copy link to ${piece.title}`);
      const stats = section.querySelector<HTMLAnchorElement>('.st-more a:last-of-type')!;
      stats.href = `/p/${piece.slug}/analytics`;
      stats.setAttribute('aria-label', `Stats for ${piece.title}`);
    }

    return {
      section, piece, toggle, poster,
      media: section.querySelector<HTMLElement>('.st-media')!,
      progress: section.querySelector<HTMLElement>('.st-prog i')!,
      time: 0,
    };
  });

  const before = document.createDocumentFragment();
  const after = document.createDocumentFragment();
  slides.forEach(({ section }, index) => {
    if (index < initial) before.append(section);
    else if (index > initial) after.append(section);
  });
  root.prepend(before);
  root.append(after);

  function setState(index: number, state: 'playing' | 'paused' | 'loading' | 'blocked' | 'error') {
    const { section, toggle, piece } = slides[index];
    section.dataset.state = state;
    const verb = { playing: 'Pause', paused: 'Play', loading: 'Cancel loading', blocked: 'Play', error: 'Retry' }[state];
    toggle.setAttribute('aria-label', `${verb} ${piece.title}`);
  }

  function showPoster(index: number) {
    const slide = slides[index];
    if (slide && !slide.poster.hasAttribute('src')) slide.poster.src = slide.piece.posterUrl;
  }

  const posters = new IntersectionObserver((observed) => {
    for (const { isIntersecting, target } of observed) {
      if (!isIntersecting) continue;
      showPoster(Number((target as HTMLElement).dataset.index));
      posters.unobserve(target);
    }
  }, { rootMargin: '20% 0px' });

  for (const { section, poster } of slides) {
    if (root.dataset.cors) {
      const tint = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 40;
        const context = canvas.getContext('2d');
        if (!context || !poster.naturalWidth) return;
        context.drawImage(poster, 0, 0, 32, 40);
        const { data } = context.getImageData(0, 0, 32, 40);
        const sum = [0, 0, 0];
        let samples = 0;
        for (let y = 0; y < 40; y++) {
          for (let x = 0; x < 32; x++) {
            if (x > 0 && x < 31 && y > 0 && y < 39) continue;
            for (let channel = 0; channel < 3; channel++)
              sum[channel] += data[(y * 32 + x) * 4 + channel];
            samples++;
          }
        }
        section.style.setProperty('--edge', `rgb(${sum.map((value) => Math.round(value / samples)).join(' ')})`);
      };
      if (poster.complete && poster.naturalWidth) tint();
      else poster.addEventListener('load', tint, { once: true });
    }
    if (section !== slides[initial].section) posters.observe(section);
  }

  // Keep the same media element for Safari's per-element playback permission.
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  let stream = false;
  let next: ReturnType<typeof download> | undefined;
  let active: ReturnType<typeof download> | undefined;

  function download(index: number) {
    const controller = new AbortController();
    const result = downloadClip(slides[index].piece.clipUrl, controller.signal).catch(() => undefined);
    return { index, controller, result };
  }

  function bufferEnd() {
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime + 0.05 && video.buffered.end(i) >= video.currentTime)
        return video.buffered.end(i);
    }
    return video.currentTime;
  }

  function loadAhead() {
    if (!root.dataset.cors || !flowing || video.paused || !slides[current + 1] || next) return;
    // Let the active stream have the connection until it has time in reserve.
    if (stream && (!Number.isFinite(video.duration) || bufferEnd() < Math.min(video.duration - 0.05, video.currentTime + 5))) return;
    showPoster(current + 1);
    next = download(current + 1);
  }

  function clearSource() {
    video.parentElement?.removeAttribute('data-frame');
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  }

  function prepare(prefetched?: typeof active) {
    const slide = slides[current];
    stream = !prefetched && Boolean(canStreamClip() || !root.dataset.cors);
    // Leave the video in the document throughout navigation. Only its position changes.
    if (video.parentElement !== slide.media) {
      if (video.isConnected && typeof slide.media.moveBefore === 'function') slide.media.moveBefore(video, null);
      else slide.media.append(video);
    }
    if (stream) video.src = slide.piece.clipUrl;
    else active = prefetched ?? download(current);
  }

  function begin(index: number, token: number) {
    if (index !== current || token !== playback || !flowing) return;
    void video.play().catch((error: DOMException) => {
      if (token !== playback || !flowing) return;
      flowing = false;
      setState(index, error.name === 'NotAllowedError' ? 'blocked' : 'error');
    });
  }

  function play(fromGesture: boolean) {
    const index = current;
    const token = ++playback;
    setState(index, 'loading');
    if (video.error || (!video.hasAttribute('src') && !active)) prepare();
    if (video.hasAttribute('src')) {
      if (fromGesture) unlocked = true;
      begin(index, token);
      return;
    }
    if (fromGesture && !unlocked) {
      allowPlayback(video);
      unlocked = true;
    }
    void active?.result.then((blob) => {
      if (token !== playback || !flowing) return;
      active = undefined;
      if (!blob) {
        flowing = false;
        setState(index, 'error');
        return;
      }
      stream = false;
      objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
      begin(index, token);
    });
  }

  function select(index: number) {
    if (current === index) return;
    ++playback;
    const slide = slides[current];
    slide.time = video.ended ? 0 : video.currentTime;
    clearSource();
    setState(current, 'paused');
    active?.controller.abort();
    active = undefined;
    const prefetched = next?.index === index ? next : undefined;
    if (!prefetched) next?.controller.abort();
    next = undefined;
    current = index;
    showPoster(index);
    prepare(prefetched);
    if (flowing) play(false);
  }

  function sectionTop(section: HTMLElement) {
    return pageScroll.matches
      ? section.offsetTop + root.getBoundingClientRect().top + window.scrollY
      : section.offsetTop;
  }

  function go(index: number, behavior: ScrollBehavior = reducedMotion.matches ? 'instant' : 'smooth') {
    if (!slides[index]) return;
    (pageScroll.matches ? window : root).scrollTo({
      top: index === 0 && pageScroll.matches ? 0 : sectionTop(slides[index].section),
      behavior,
    });
  }

  function stop() {
    ++playback;
    flowing = false;
    video.pause();
    setState(current, 'paused');
  }

  video.addEventListener('loadedmetadata', () => {
    const time = slides[current].time;
    if (time && time < video.duration) video.currentTime = time;
  });
  video.addEventListener('playing', () => {
    if (video.paused || !flowing) return;
    slides[current].media.dataset.frame = '';
    setState(current, 'playing');
    loadAhead();
  });
  video.addEventListener('progress', loadAhead);
  video.addEventListener('waiting', () => {
    if (flowing && !video.paused) setState(current, 'loading');
  });
  video.addEventListener('timeupdate', () => {
    slides[current].progress.style.transform = `scaleX(${video.duration ? video.currentTime / video.duration : 0})`;
    loadAhead();
  });
  video.addEventListener('ended', () => {
    setState(current, 'paused');
    if (slides[current + 1]) go(current + 1);
    else flowing = false;
  });

  for (const [index, { section, toggle }] of slides.entries()) {
    const press = () => {
      if (current !== index) {
        go(index);
        return;
      }
      if (flowing) stop();
      else {
        flowing = true;
        play(true);
      }
    };
    toggle.addEventListener('click', press);
    toggle.disabled = false;
    section.querySelector('.st-toggle')!.addEventListener('click', press);
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-step]')) {
      button.addEventListener('click', () => {
        const step = Number(button.dataset.step);
        const target = slides[index + step];
        if (!target) return;
        go(index + step);
        if (document.activeElement === button) {
          const same = target.section.querySelector<HTMLButtonElement>(`[data-step="${step}"]:not([disabled])`);
          (same ?? target.toggle).focus({ preventScroll: true });
        }
      });
    }
  }

  go(current, 'instant');
  prepare();

  function syncScroll() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const point = pageScroll.matches ? window.scrollY + innerHeight / 2 : root.scrollTop + root.clientHeight / 2;
      const index = slides.findLastIndex(({ section }) => sectionTop(section) <= point);
      if (index !== -1) select(index);
    });
  }
  root.addEventListener('scroll', syncScroll, { passive: true });
  window.addEventListener('scroll', syncScroll, { passive: true });
  pageScroll.addEventListener('change', () => go(current, 'instant'));
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      go(current + (event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.code === 'Space' && event.target === document.body) {
      event.preventDefault();
      slides[current].toggle.click();
    }
  });
}

export {};
