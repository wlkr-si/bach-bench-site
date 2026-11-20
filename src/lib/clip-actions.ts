// Download and copy-link behaviour for every Piece, wherever its buttons sit.
// While a Clip is being fetched its link carries data-busy; a finished
// download or copy carries data-done for a moment.
const saving = new WeakSet<HTMLAnchorElement>();
const resets = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function done(control: HTMLElement) {
  control.dataset.done = '';
  clearTimeout(resets.get(control));
  resets.set(control, setTimeout(() => delete control.dataset.done, 2000));
}

document.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('[data-save-clip]');
  const button = event.target.closest<HTMLButtonElement>('[data-copy-address]');
  if (link) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (saving.has(link)) return;
    saving.add(link);
    link.dataset.busy = '';
    const status = link.parentElement!.querySelector('[role="status"]')!;
    status.textContent = '';

    try {
      const response = await fetch(link.href);
      if (!response.ok) throw new Error('Clip unavailable');
      const file = new File([await response.blob()], link.download, { type: 'video/mp4' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          done(link);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(file);
      const download = document.createElement('a');
      download.href = url;
      download.download = link.download;
      document.body.append(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      done(link);
    } catch {
      status.textContent = 'Could not download Clip';
    } finally {
      delete link.dataset.busy;
      saving.delete(link);
    }
  }

  if (button) {
    const status = button.parentElement!.querySelector('[role="status"]')!;
    try {
      await navigator.clipboard.writeText(button.dataset.copyAddress!);
      done(button);
      status.textContent = 'Link copied';
      setTimeout(() => (status.textContent = ''), 2000);
    } catch {
      status.textContent = 'Could not copy link';
    }
  }
});

export {};
