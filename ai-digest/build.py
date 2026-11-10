#!/usr/bin/env python3
"""Render the daily AI digest.

Usage:
    python3 ai-digest/build.py ai-digest/data/2026-11-10.json

Writes ai-digest/archive/<date>.html, refreshes ai-digest/index.html with the
same content (so the latest edition is always at /ai-digest/), and rebuilds
ai-digest/archive/index.html, the list of every past edition.

The page is self-contained: no CDN, no JavaScript framework, works as a file
opened from a phone or served from GitHub Pages.
"""
import html
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.join(HERE, "archive")

SECTION_ORDER = [
    ("claude", "Claude and Anthropic", "What Anthropic shipped: Claude Code, skills, connectors, Agent SDK, models."),
    ("aws", "AWS and Bedrock", "What changed on the AWS side: Bedrock, AgentCore, Strands, Nova, Q, Kiro."),
    ("skills", "Skills worth adding", "Concrete skills and plugins for a Claude Agent SDK framework."),
    ("videos", "YouTube worth watching", "Fresh videos on skills, Claude Code tips, connectors, and agent building."),
    ("industry", "Rest of the AI world", "OpenAI, Google, Meta, open models, tooling, and policy."),
    ("ideas", "Side-business and app ideas", "Launches, pricing moves, and gaps a solo developer could exploit."),
]

CSS = r"""
:root{
  --bg:#0f1115;--panel:#171a21;--panel2:#1d2129;--line:#2a2f3a;--text:#e8eaf0;--muted:#9aa3b2;
  --accent:#d97757;--accent2:#6ea8fe;--chip:#242938;--ok:#5fbf8a;--warn:#e8b14c;
  --radius:14px;--max:1180px;
}
@media (prefers-color-scheme: light){
  :root{--bg:#f6f7f9;--panel:#ffffff;--panel2:#f1f3f6;--line:#e1e5ec;--text:#161922;--muted:#5d6675;--chip:#eef1f6}
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text)}
a{color:var(--accent2);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:var(--max);margin:0 auto;padding:0 18px 60px}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;padding:12px 18px}
.brand{font-weight:700;letter-spacing:.2px;display:flex;align-items:center;gap:8px}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 25%,transparent)}
.brand small{color:var(--muted);font-weight:500}
nav.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
nav.tabs a{padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:13px;white-space:nowrap}
nav.tabs a.active,nav.tabs a:hover{border-color:var(--accent);text-decoration:none}
.search{width:100%;max-width:300px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:14px}
.hero{padding:34px 0 10px}
.hero h1{margin:0 0 6px;font-size:clamp(26px,4vw,38px);line-height:1.15}
.hero .date{color:var(--muted);font-size:14px}
.hero .lead{font-size:17px;max-width:820px;margin:14px 0 0}
.tldr{margin:22px 0 8px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 20px}
.tldr h2{margin:0 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.tldr ol{margin:0;padding-left:20px}
.tldr li{margin:6px 0}
section.block{margin-top:38px;scroll-margin-top:80px}
section.block>h2{font-size:22px;margin:0 0 4px;display:flex;align-items:center;gap:10px}
section.block>h2 .n{font-size:12px;color:var(--muted);font-weight:500;background:var(--chip);padding:2px 8px;border-radius:999px}
section.block>p.sub{margin:0 0 16px;color:var(--muted);font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 16px 14px;display:flex;flex-direction:column;gap:8px;transition:transform .12s,border-color .12s}
.card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--accent) 60%,var(--line))}
.card.hidden{display:none}
.card .meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--muted)}
.card .meta .src{font-weight:600;color:var(--text)}
.card .meta .when{background:var(--chip);padding:1px 8px;border-radius:999px}
.card .meta .when.new{background:color-mix(in srgb,var(--ok) 22%,var(--chip));color:var(--ok)}
.card h3{margin:0;font-size:16.5px;line-height:1.3}
.card h3 a{color:var(--text)}
.card p{margin:0;font-size:14.5px;color:var(--text)}
.card .why{font-size:13.5px;color:var(--muted);border-left:3px solid var(--accent);padding-left:10px;margin-top:2px}
.card .why b{color:var(--text)}
.card .tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:auto;padding-top:6px}
.tag{font-size:11.5px;background:var(--chip);color:var(--muted);padding:2px 8px;border-radius:999px}
.card .open{margin-top:6px;font-size:13px}
.card .open a{display:inline-flex;align-items:center;gap:6px}
.video .thumb{display:block;aspect-ratio:16/9;background:var(--panel2);border-radius:10px;overflow:hidden;position:relative}
.video .thumb img{width:100%;height:100%;object-fit:cover;display:block}
.video .thumb .play{position:absolute;inset:0;display:grid;place-items:center;font-size:40px;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.skill .status{font-size:12px;font-weight:600}
.skill .status.recommended{color:var(--ok)} .skill .status.consider{color:var(--warn)}
footer{margin-top:50px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
footer a{color:var(--muted);text-decoration:underline}
.empty{color:var(--muted);font-size:14px;padding:12px;border:1px dashed var(--line);border-radius:10px}
.archive-list{list-style:none;padding:0;margin:0}
.archive-list li{padding:12px 0;border-bottom:1px solid var(--line)}
.archive-list li a{font-size:17px;color:var(--text)}
.archive-list li span{display:block;color:var(--muted);font-size:14px}
@media (max-width:640px){.grid{grid-template-columns:1fr}.hero{padding-top:22px}}
"""

JS = r"""
(function(){
  const q=document.getElementById('q');
  const cards=[...document.querySelectorAll('.card')];
  const secs=[...document.querySelectorAll('section.block')];
  function filter(){
    const t=(q.value||'').trim().toLowerCase();
    cards.forEach(c=>c.classList.toggle('hidden', t && !c.textContent.toLowerCase().includes(t)));
    secs.forEach(s=>{const vis=s.querySelectorAll('.card:not(.hidden)').length;s.style.display=(t&&!vis)?'none':''});
  }
  q&&q.addEventListener('input',filter);
  const links=[...document.querySelectorAll('nav.tabs a[href^="#"]')];
  const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){links.forEach(l=>l.classList.toggle('active',l.getAttribute('href')==='#'+e.target.id))}})},{rootMargin:'-40% 0px -55% 0px'});
  secs.forEach(s=>obs.observe(s));
})();
"""


def esc(s):
    return html.escape(str(s or ""), quote=True)


def yt_id(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None


def when_chip(item, today):
    d = item.get("date") or item.get("age") or ""
    cls = "when"
    if d == today or d.lower() in ("today", "yesterday") or "hour" in d.lower() or "1 day" in d.lower():
        cls += " new"
    return f'<span class="{cls}">{esc(d)}</span>' if d else ""


def card(item, today, kind="news"):
    tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in item.get("tags", []))
    why = item.get("why")
    why_html = f'<div class="why"><b>Why it matters:</b> {esc(why)}</div>' if why else ""
    src = item.get("source") or item.get("channel") or ""
    url = item.get("url", "#")
    if kind == "video":
        vid = yt_id(url)
        thumb = (f'<a class="thumb" href="{esc(url)}" target="_blank" rel="noopener">'
                 f'<img loading="lazy" alt="" onerror="this.remove()" src="https://i.ytimg.com/vi/{vid}/hqdefault.jpg"><span class="play">&#9654;</span></a>') if vid else ""
        return (f'<article class="card video">{thumb}<div class="meta"><span class="src">{esc(src)}</span>{when_chip(item, today)}</div>'
                f'<h3><a href="{esc(url)}" target="_blank" rel="noopener">{esc(item["title"])}</a></h3>'
                f'<p>{esc(item.get("summary") or item.get("note") or "")}</p>{why_html}<div class="tags">{tags}</div>'
                f'<div class="open"><a href="{esc(url)}" target="_blank" rel="noopener">Watch on YouTube &rarr;</a></div></article>')
    if kind == "skill":
        status = item.get("status", "recommended")
        return (f'<article class="card skill"><div class="meta"><span class="src">{esc(item.get("source") or "Skill")}</span>'
                f'<span class="status {esc(status)}">{esc(status)}</span></div>'
                f'<h3><a href="{esc(url)}" target="_blank" rel="noopener">{esc(item["title"])}</a></h3>'
                f'<p>{esc(item.get("summary") or "")}</p>{why_html}<div class="tags">{tags}</div>'
                f'<div class="open"><a href="{esc(url)}" target="_blank" rel="noopener">Open &rarr;</a></div></article>')
    return (f'<article class="card"><div class="meta"><span class="src">{esc(src)}</span>{when_chip(item, today)}</div>'
            f'<h3><a href="{esc(url)}" target="_blank" rel="noopener">{esc(item["title"])}</a></h3>'
            f'<p>{esc(item.get("summary") or "")}</p>{why_html}<div class="tags">{tags}</div>'
            f'<div class="open"><a href="{esc(url)}" target="_blank" rel="noopener">Read the source &rarr;</a></div></article>')


def render(data):
    today = data["date"]
    nice = date.fromisoformat(today).strftime("%A, %d %B %Y")
    sections = {s["id"]: s for s in data.get("sections", [])}
    kinds = {"videos": "video", "skills": "skill"}
    tabs = "".join(f'<a href="#{sid}">{esc(title)}</a>' for sid, title, _ in SECTION_ORDER if sections.get(sid, {}).get("items"))
    tabs += '<a href="archive/">Archive</a>'
    body = []
    for sid, title, sub in SECTION_ORDER:
        sec = sections.get(sid)
        if not sec or not sec.get("items"):
            continue
        cards = "".join(card(it, today, kinds.get(sid, "news")) for it in sec["items"])
        body.append(f'<section class="block" id="{sid}"><h2>{esc(sec.get("title") or title)}<span class="n">{len(sec["items"])}</span></h2>'
                    f'<p class="sub">{esc(sec.get("subtitle") or sub)}</p><div class="grid">{cards}</div></section>')
    tldr = "".join(f"<li>{esc(x)}</li>" for x in data.get("tldr", []))
    tldr_html = f'<div class="tldr"><h2>Top of the day</h2><ol>{tldr}</ol></div>' if tldr else ""
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Digest, {esc(today)}</title><meta name="description" content="{esc(data.get('headline',''))}">
<style>{CSS}</style></head>
<body>
<header class="top"><div class="wrap"><div class="brand"><span class="dot"></span>AI Digest <small>{esc(today)}</small></div>
<input id="q" class="search" type="search" placeholder="Filter this edition..." aria-label="Filter"><nav class="tabs">{tabs}</nav></div></header>
<main class="wrap">
<div class="hero"><div class="date">{esc(nice)} &middot; covers roughly the previous 24 to 72 hours</div>
<h1>{esc(data.get('headline',''))}</h1><p class="lead">{esc(data.get('lead',''))}</p>{tldr_html}</div>
{''.join(body)}
<footer>Compiled by Claude from the linked sources. Dates are as reported by each source and may be off by a day across time zones. Items marked uncertain in the summaries were not fully verified. <a href="archive/">All editions</a> &middot; <a href="data/{esc(today)}.json">JSON for this edition</a></footer>
</main><script>{JS}</script></body></html>"""


def render_archive(entries):
    items = "".join(f'<li><a href="{esc(d)}.html">{esc(date.fromisoformat(d).strftime("%A, %d %B %Y"))}</a><span>{esc(h)}</span></li>' for d, h in entries)
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Digest archive</title><style>{CSS}</style></head><body><header class="top"><div class="wrap"><div class="brand"><span class="dot"></span>AI Digest <small>archive</small></div>
<nav class="tabs"><a href="../">Latest edition</a></nav></div></header><main class="wrap"><div class="hero"><h1>All editions</h1></div>
<ul class="archive-list">{items}</ul></main></body></html>"""


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    page = render(data)
    os.makedirs(ARCHIVE, exist_ok=True)
    out = os.path.join(ARCHIVE, f"{data['date']}.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page.replace('href="archive/"', 'href="./"').replace('href="data/', 'href="../data/'))
    with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    entries = []
    for name in sorted(os.listdir(os.path.join(HERE, "data")), reverse=True):
        if name.endswith(".json"):
            with open(os.path.join(HERE, "data", name), encoding="utf-8") as f:
                d = json.load(f)
            entries.append((d["date"], d.get("headline", "")))
    with open(os.path.join(ARCHIVE, "index.html"), "w", encoding="utf-8") as f:
        f.write(render_archive(entries))
    print(f"wrote {out} and {os.path.join(HERE, 'index.html')} ({len(entries)} editions in archive)")


if __name__ == "__main__":
    main()
