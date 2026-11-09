---
name: realistic-job-market-research
description: "Find jobs worth applying to, check a job link, or refresh a previous shortlist using existing career evidence. Use for '지원할 만한 데 찾아줘', '이 회사 어때?', or '새 공고만 봐줘'. Does not submit applications."
license: MIT
compatibility: "Codex and Claude Code. Bundled collectors use Node.js 20+; live sources need network and the configured browser."
---

# Realistic Job Market Research

“나 지원할 만한 데 찾아줘.” is enough. The agent handles context, research,
tools and checks; the user should not need to learn modes or prepare files.

## Start from the request

1. Reuse the current conversation, saved candidate profile and career sources.
   Do not ask for facts already available. If an essential constraint cannot be
   found, ask one short question and continue research that does not depend on it.
2. Choose the work from the user's words:
   - “찾아줘” → broad enough discovery before selecting priorities.
   - A company or job link → check that employer or role directly.
   - “새 공고 / 다시 봐줘” → compare with the previous result and recheck changes.
   - “전체 수집 / 전체 원장” → full-source census and dashboard.
   A normal recommendation does not require a full census first.
3. Follow only the selected route in [the agent workflow](references/agent-workflows.md).
   Read current exact job details, match the user's career, and check the practical
   obstacles: employer risk, actual worksite, pay/level and hiring effort.
4. Return the useful decision. Keep setup, commands, JSON, audit stages and
   scoring machinery inside the agent's work unless the user asks for them.

## Finish the research, then shorten the answer

Answer length is a presentation choice, not a search limit. Do not stop because
three recommendations were found. For broad discovery, start from current job
listings, review the promising queue already observed, and change the source or
query family when results are sparse or repetitive. A worker's topic is a routing
aid, not a reason to discard a useful adjacent role. Keep the user's real limits.

Maintain one cumulative private report and ledger: candidates, conditional
options, exclusions, conflicts and blockers. Before closing a search, use the
internal [completion check](references/search-completion.md). Known promising
items must be reviewed or explicitly limited, not silently left for another
“더 찾아줘”. This is bounded research, not proof the entire market is exhausted.

Lead with useful priorities and their job links, actual product/work, fit, main
obstacle and next action. Group the full reviewed candidate/conditional set and
link the cumulative results in the first response; summarize to the requested
length without hiding already available findings. Use plain Korean such as
“지원 준비”, “확인 후 판단”, or “제외”.

State the check date and actual coverage briefly, with source links near claims.
Scores and dashboards are optional; the user does not prepare workflow files.

## Keep the decision honest

- Preserve the user's actual constraints. Reuse verified career evidence;
  do not invent achievements or quietly relax an exclusion.
- Missing information stays unknown. In particular, an unlisted coding test,
  take-home or live-coding step is not an explicit waiver.
- Missing optional facts or a short summary are not proof of ineligibility.
  Separate mandatory requirements, preferences, application preparation and
  offer acceptance; do not hide useful conditional options behind unknown finance.
- An attractive role can justify preparation while employer/offer conditions
  remain unresolved. Do not equate a search result with an active exact role.
- Research does not authorize applying, saving, messaging, contacting anyone
  or editing the user's global profile. Keep private facts and contacts out of
  public artifacts.
