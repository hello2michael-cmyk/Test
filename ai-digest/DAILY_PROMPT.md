# Daily AI digest: instruction for the scheduled task

You are producing today's edition of the AI Digest in this repository
(`ai-digest/`). Read `ai-digest/README.md` and `ai-digest/build.py` first, and
open the most recent file in `ai-digest/data/` to see the exact JSON shape and
the tone of the summaries.

The reader runs an internal agent framework on the **Claude Agent SDK** on
**AWS**, and on the side wants to build an app or a small AI business. Report
what came out **yesterday** (roughly the previous 24 to 48 hours, nothing older
than 3 days unless it is big and was missed).

## Research (use several subagents in parallel, then verify)

1. **Claude and Anthropic**: anthropic.com/news, anthropic.com/engineering,
   the Claude Code CHANGELOG on GitHub (anthropics/claude-code), the
   anthropics/skills repository, the Agent SDK release pages
   (claude-agent-sdk-python / typescript), docs.claude.com release notes,
   Claude on Bedrock. Include new skills, connectors, MCP changes, SDK changes,
   model and pricing changes.
2. **AWS**: aws.amazon.com/new (AI and ML), the AWS Machine Learning blog,
   Bedrock, AgentCore, Strands Agents, Nova, Amazon Q, Kiro.
3. **Skills worth adding**: 3 to 6 concrete skills or plugins (anthropics/skills,
   the Claude Code plugin marketplace, community skills) that fit a Claude Agent
   SDK framework on AWS. Mark each `recommended` or `consider`.
4. **YouTube**: search YouTube (web search with site:youtube.com, and fetch
   https://www.youtube.com/results?search_query=<terms>&sp=CAI%253D for
   newest-first) for videos from the last 2 to 7 days on Claude skills, Claude
   Code tips, connectors and MCP, Agent SDK, Bedrock AgentCore, and building
   apps with AI. Only list videos whose watch URL you actually saw.
5. **Rest of the AI world**: OpenAI, Google, Meta, Mistral, xAI, DeepSeek, Qwen,
   major tooling (Cursor, Copilot, Vercel, LangChain), policy if it is big.
6. **Side-business and app ideas**: Product Hunt top AI launches, Show HN,
   Indie Hackers, pricing changes that change unit economics, new
   marketplaces (MCP, skills, apps). Give each a one-line "how a solo developer
   could use this".

Verify every URL by fetching it. Do not invent links, dates or video IDs. If a
date is uncertain, say so in the summary.

## Write

Create `ai-digest/data/<YYYY-MM-DD>.json` (today's date, UTC) with:

```
{
  "date": "YYYY-MM-DD",
  "headline": "one sentence, the biggest thing of the day",
  "lead": "two or three sentences setting the day in context for this reader",
  "tldr": ["5 to 7 one-line bullets, most important first"],
  "sections": [
    {"id": "claude",   "items": [ {"title","url","source","date","summary","why","tags":[]} ]},
    {"id": "aws",      "items": [...]},
    {"id": "skills",   "items": [ {"title","url","source","summary","why","status":"recommended|consider","tags":[]} ]},
    {"id": "videos",   "items": [ {"title","url","channel","date","summary","tags":[]} ]},
    {"id": "industry", "items": [...]},
    {"id": "ideas",    "items": [ {"title","url","source","date","summary","why","tags":[]} ]}
  ]
}
```

Summaries: 2 to 3 plain sentences with the facts (what, who, numbers). The
`why` line is written for this reader (Agent SDK on AWS, or solo app builder).
Aim for 6 to 12 items in the Claude section, 4 to 8 in AWS, 3 to 6 skills,
6 to 12 videos, 6 to 10 industry, 5 to 8 ideas. Fewer is fine on a quiet day;
never pad with old or unverified items.

Then run:

```
python3 ai-digest/build.py ai-digest/data/<YYYY-MM-DD>.json
```

and open `ai-digest/index.html` to check it renders (a quick Playwright
screenshot is enough).

## Deliver

Commit `ai-digest/data/<date>.json`, `ai-digest/index.html`,
`ai-digest/archive/<date>.html` and `ai-digest/archive/index.html` with the
message `AI digest <date>`. Push to your designated branch and open a pull
request into `main` titled `AI digest <date>` whose body is the `tldr` list.
Merging it publishes the edition at
https://hello2michael-cmyk.github.io/Test/ai-digest/ . Finish your reply with
the pull request link and the `tldr` bullets.
