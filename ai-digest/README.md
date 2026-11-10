# AI Digest

A daily, one-page briefing on what happened in AI in the previous day, built for
someone who runs a Claude Agent SDK framework on AWS and is also looking for
app / side-business ideas.

Latest edition: https://hello2michael-cmyk.github.io/Test/ai-digest/
Archive: https://hello2michael-cmyk.github.io/Test/ai-digest/archive/

## Layout

```
ai-digest/
  index.html          latest edition (regenerated every day)
  archive/<date>.html every past edition
  archive/index.html  list of editions
  data/<date>.json    the source data for each edition (edit this, not the HTML)
  build.py            renders data/<date>.json into the HTML pages
  DAILY_PROMPT.md     the instruction the scheduled Claude task runs each morning
```

## Rebuild by hand

```
python3 ai-digest/build.py ai-digest/data/2026-11-10.json
```

## Sections of each edition

1. Claude and Anthropic: Claude Code, Agent Skills, connectors, Agent SDK, models.
2. AWS and Bedrock: Bedrock, AgentCore, Strands, Nova, Amazon Q, Kiro.
3. Skills worth adding: concrete skills / plugins for a Claude Agent SDK framework.
4. YouTube worth watching: fresh videos on skills, Claude Code tips, connectors.
5. Rest of the AI world: OpenAI, Google, Meta, open models, tooling.
6. Side-business and app ideas: launches, pricing moves, gaps a solo developer can use.

Every card carries the source link, the date as reported by the source, a short
summary, and a "why it matters" line written for the reader above.

## How a new edition is produced

A scheduled Claude task (set up from the Claude app, see DAILY_PROMPT.md)
starts a fresh session every morning, researches the previous day, writes
`data/<today>.json`, runs `build.py`, commits, pushes, and opens a pull request
to `main`. Merging the pull request publishes it to GitHub Pages.
