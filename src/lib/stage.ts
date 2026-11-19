const root = document.querySelector<HTMLElement>('[data-stage]')!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pageScroll = matchMedia(
  '(max-height: 500px), (max-width: 600px) and (max-height: 580px)',
);
const slides = [...root.querySelectorAll<HTMLElement>('.st-slide')].map(
  (section) => ({
    section,
    title: section.getAttribute('aria-label'),
    video: section.querySelector('video')!,
    surface: section.querySelector<HTMLButtonElement>('.st-toggle')!,
    toggle: section.querySelector<HTMLButtonElement>('[data-play]')!,
    progress: section.querySelector<HTMLElement>('.st-prog i')!,
  }),
);

let current = Number(root.dataset.initial);
let flowing = false;
let frame = 0;

function sectionTop(section: HTMLElement) {
  const top = section.offsetTop;
  return pageScroll.matches
    ? top + root.getBoundingClientRect().top + window.scrollY
    : top;
}

function go(
  index: number,
  behavior: ScrollBehavior = reducedMotion.matches ? 'instant' : 'smooth',
) {
  if (!slides[index]) return;
  const scroller = pageScroll.matches ? window : root;
  scroller.scrollTo({
    top:
      index === 0 && pageScroll.matches ? 0 : sectionTop(slides[index].section),
    behavior,
  });
}

function setState(section: HTMLElement, state: string) {
  section.dataset.state = state;
}

function showPoster(index: number) {
  const video = slides[index]?.video;
  if (video && !video.poster) video.poster = video.dataset.poster!;
}

function play(index: number) {
  const { video, section } = slides[index];
  if (video.readyState < 3) setState(section, 'loading');
  void video.play().catch(() => {
    if (slides[current]?.video === video && video.paused) {
      flowing = false;
      setState(section, 'blocked');
    }
  });
}

function select(index: number) {
  if (current === index) return;
  slides[current].video.pause();
  current = index;
  showPoster(index - 1);
  showPoster(index + 1);
  if (flowing) play(index);
}

for (const [
  index,
  { section, title, video, surface, toggle, progress },
] of slides.entries()) {
  const poster = new Image();
  poster.onload = () => {
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
        for (let channel = 0; channel < 3; channel++)
          sum[channel] += data[(y * 32 + x) * 4 + channel];
        samples++;
      }
    }
    const edge = sum.map((value) => Math.round(value / samples)).join(' ');
    section.style.setProperty('--edge', `rgb(${edge})`);
  };
  poster.src = video.dataset.poster!;

  const press = () => {
    if (current !== index) {
      go(index);
      return;
    }
    flowing = video.paused;
    if (flowing) play(index);
    else video.pause();
  };
  toggle.addEventListener('click', press);
  surface.addEventListener('click', press);
  const syncPlayback = () => {
    const playing = !video.paused && !video.ended;
    if (playing && video.readyState < 3) return;
    setState(section, playing ? 'playing' : 'paused');
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title}`);
  };
  video.addEventListener('waiting', () => {
    if (!video.paused) setState(section, 'loading');
  });
  video.addEventListener('playing', syncPlayback);
  video.addEventListener('play', () => {
    if (index !== current) video.pause();
    syncPlayback();
  });
  video.addEventListener('pause', syncPlayback);
  video.addEventListener('timeupdate', () => {
    progress.style.transform = `scaleX(${video.duration ? video.currentTime / video.duration : 0})`;
  });
  video.addEventListener('ended', () => {
    syncPlayback();
    if (index !== current) return;
    if (slides[index + 1]) {
      go(index + 1);
    } else flowing = false;
  });
}

go(current, 'instant');
function syncScroll() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const point = pageScroll.matches
      ? window.scrollY + innerHeight / 2
      : root.scrollTop + root.clientHeight / 2;
    const index = slides.findLastIndex(
      ({ section }) => sectionTop(section) <= point,
    );
    if (slides[index]) select(index);
  });
}
root.addEventListener('scroll', syncScroll, { passive: true });
window.addEventListener('scroll', syncScroll, { passive: true });
pageScroll.addEventListener('change', () => go(current, 'instant'));
for (const [index, { section }] of slides.entries()) {
  for (const button of section.querySelectorAll<HTMLButtonElement>(
    '[data-step]',
  )) {
    button.addEventListener('click', () => {
      const target = slides[index + Number(button.dataset.step)];
      if (!target) return;
      go(index + Number(button.dataset.step));
      // Keyboard focus follows to the Piece now in view.
      if (document.activeElement === button) {
        const same = target.section.querySelector<HTMLButtonElement>(
          `[data-step="${button.dataset.step}"]:not([disabled])`,
        );
        (same ?? target.toggle).focus({ preventScroll: true });
      }
    });
  }
}
document.addEventListener('keydown', (event) => {
  if (slides.length === 0 || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented)
    return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    go(current + (event.key === 'ArrowDown' ? 1 : -1));
  }
  if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault();
    slides[current]?.toggle.click();
  }
});

export {};
