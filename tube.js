// Tube Player: a home-screen web app that plays YouTube videos through YouTube's own player.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY_HISTORY = 'tube.history', KEY_SAVED = 'tube.saved', KEY_API = 'tube.apiKey';

  // ---------- storage ----------
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  let history = load(KEY_HISTORY, []);
  let saved = load(KEY_SAVED, []);

  // ---------- helpers ----------
  const ID_RE = /^[A-Za-z0-9_-]{11}$/;
  function videoId(text) {
    const t = (text || '').trim();
    if (ID_RE.test(t)) return t;
    let u; try { u = new URL(t); } catch { return null; }
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    if (host.endsWith('youtu.be')) return ID_RE.test(parts[0] || '') ? parts[0] : null;
    if (!host.endsWith('youtube.com') && !host.endsWith('youtube-nocookie.com')) return null;
    const v = u.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;
    if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0]) && ID_RE.test(parts[1])) return parts[1];
    return null;
  }
  const thumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const pageUrl = id => `https://www.youtube.com/watch?v=${id}`;
  const unescapeHtml = s => { const d = document.createElement('textarea'); d.innerHTML = s; return d.value; };

  // ---------- player (YouTube IFrame API, plain iframe as fallback) ----------
  let player = null, current = null, apiReady = false, pending = null, plainFrame = null;
  window.onYouTubeIframeAPIReady = () => { apiReady = true; if (pending && !plainFrame) { const v = pending; pending = null; loadInPlayer(v); } };
  const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(tag);
  const embedUrl = id => `https://www.youtube.com/embed/${id}?playsinline=1&autoplay=1&rel=0&modestbranding=1`;

  function play(video) {
    current = video;
    showNow(video);
    recordWatch(video);
    if (plainFrame) { plainFrame.src = embedUrl(video.id); return; }
    if (apiReady) { loadInPlayer(video); return; }
    pending = video;
    // If the player script has not arrived in a few seconds, fall back to a plain embed.
    setTimeout(() => { if (!apiReady && pending === video) { pending = null; usePlainFrame(video); } }, 4000);
  }
  function usePlainFrame(video) {
    plainFrame = document.createElement('iframe');
    plainFrame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    plainFrame.allowFullscreen = true;
    plainFrame.src = embedUrl(video.id);
    $('yt').replaceWith(plainFrame);
  }
  function loadInPlayer(video) {
    if (player) { player.loadVideoById(video.id); return; }
    player = new YT.Player('yt', {
      videoId: video.id,
      playerVars: { playsinline: 1, autoplay: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: e => { e.target.playVideo(); updateMeta(); },
        onStateChange: updateMeta
      }
    });
  }
  function updateMeta() {
    if (!player || !player.getVideoData || !current) return;
    const d = player.getVideoData();
    if (d && d.title && d.video_id === current.id) {
      current.title = d.title; current.channel = d.author || current.channel;
      showNow(current);
      history = history.map(v => v.id === current.id ? { ...v, title: current.title, channel: current.channel } : v);
      store(KEY_HISTORY, history); renderLibrary();
    }
  }
  function showNow(video) {
    $('playerCard').hidden = false;
    $('nowTitle').textContent = video.title || 'YouTube video';
    $('nowChannel').textContent = video.channel || '';
    $('saveBtn').textContent = isSaved(video.id) ? '♥ Saved' : '♡ Save';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- library ----------
  function recordWatch(video) {
    history = [{ ...video, watchedAt: Date.now() }, ...history.filter(v => v.id !== video.id)].slice(0, 200);
    store(KEY_HISTORY, history); renderLibrary();
  }
  const isSaved = id => saved.some(v => v.id === id);
  function toggleSave() {
    if (!current) return;
    saved = isSaved(current.id) ? saved.filter(v => v.id !== current.id) : [{ ...current }, ...saved];
    store(KEY_SAVED, saved); showNow(current); renderLibrary();
  }
  let tab = 'history';
  function renderLibrary() {
    const items = tab === 'history' ? history : saved;
    const box = $('library'); box.innerHTML = '';
    $('libraryEmpty').textContent = items.length ? '' : (tab === 'history' ? 'Videos you watch show up here.' : 'Tap Save on a video to keep it here.');
    $('clearBtn').hidden = tab !== 'history' || !history.length;
    items.forEach(v => box.appendChild(itemButton(v)));
  }
  function itemButton(v) {
    const b = document.createElement('button'); b.className = 'item';
    const img = document.createElement('img'); img.src = v.thumb || thumb(v.id); img.alt = '';
    const txt = document.createElement('div');
    const t = document.createElement('div'); t.className = 't'; t.textContent = v.title || 'YouTube video';
    const c = document.createElement('div'); c.className = 'c'; c.textContent = v.channel || '';
    txt.append(t, c); b.append(img, txt);
    b.addEventListener('click', () => play({ id: v.id, title: v.title, channel: v.channel, thumb: v.thumb }));
    return b;
  }

  // ---------- open a link ----------
  function openLink(text) {
    const id = videoId(text);
    if (!id) { $('linkHint').textContent = 'That does not look like a YouTube link.'; return; }
    $('linkHint').textContent = ''; $('link').value = '';
    play({ id, title: 'YouTube video', channel: '', thumb: thumb(id) });
  }
  $('openBtn').addEventListener('click', () => openLink($('link').value));
  $('link').addEventListener('keydown', e => { if (e.key === 'Enter') openLink($('link').value); });
  $('pasteBtn').addEventListener('click', async () => {
    try { openLink(await navigator.clipboard.readText()); }
    catch { $('linkHint').textContent = 'Could not read the clipboard. Paste the link into the box instead.'; }
  });

  // ---------- search (YouTube Data API v3) ----------
  async function search() {
    const q = $('query').value.trim(); if (!q) return;
    const key = $('apiKey').value.trim();
    const hint = $('searchHint'), box = $('results'); box.innerHTML = '';
    if (!key) { hint.textContent = 'Search needs a free API key. Add it in Settings below. Pasting links works without one.'; return; }
    hint.textContent = 'Searching…';
    const u = new URL('https://www.googleapis.com/youtube/v3/search');
    u.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '25', safeSearch: 'moderate', q, key });
    try {
      const r = await fetch(u); const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `YouTube answered with error ${r.status}.`);
      const items = (j.items || []).filter(i => i.id?.videoId);
      hint.textContent = items.length ? '' : 'No videos found.';
      items.forEach(i => box.appendChild(itemButton({
        id: i.id.videoId, title: unescapeHtml(i.snippet.title), channel: unescapeHtml(i.snippet.channelTitle),
        thumb: i.snippet.thumbnails?.medium?.url || thumb(i.id.videoId)
      })));
    } catch (e) { hint.textContent = e.message; }
  }
  $('searchBtn').addEventListener('click', search);
  $('query').addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); search(); } });

  // ---------- buttons ----------
  $('saveBtn').addEventListener('click', toggleSave);
  $('shareBtn').addEventListener('click', async () => {
    if (!current) return;
    const data = { title: current.title, url: pageUrl(current.id) };
    if (navigator.share) { try { await navigator.share(data); } catch { } }
    else { try { await navigator.clipboard.writeText(data.url); $('linkHint').textContent = 'Link copied.'; } catch { } }
  });
  $('ytBtn').addEventListener('click', () => { if (current) window.open(pageUrl(current.id), '_blank'); });
  $('clearBtn').addEventListener('click', () => { history = []; store(KEY_HISTORY, history); renderLibrary(); });
  document.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
    tab = b.dataset.tab; renderLibrary();
  }));
  $('apiKey').value = localStorage.getItem(KEY_API) || '';
  $('apiKey').addEventListener('input', e => localStorage.setItem(KEY_API, e.target.value.trim()));

  // ---------- start ----------
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  $('installCard').hidden = standalone;
  renderLibrary();
  const fromUrl = new URLSearchParams(location.search).get('v') || (location.hash.length > 1 ? location.hash.slice(1) : '');
  if (videoId(fromUrl)) openLink(fromUrl);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
