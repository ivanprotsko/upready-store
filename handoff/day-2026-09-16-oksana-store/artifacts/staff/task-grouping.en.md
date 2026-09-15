# Task grouping and delivery — planning template (draft, 2026-09-15 23:11 WITA)

## Goal
Split the backlog into groups of related tasks that are cheaper to run in one session (shared context), and feed them to agents without idle or overloaded sessions.

## Files (planning stage)
A task must move between groups by editing one link, never by copying text.

1. **Task file** — one file per task (`tasks/<id>.md` or `.json`): `tokens_min` / `tokens_max` (forecast, taken from measured transcripts of similar tasks, not guessed), `model`, `keywords` (affinity search when regrouping).
2. **Group file** — one file per group: index of task files (links), summed forecast min/max, models required.
3. **Agent prompt file** — start prompt for the agent + the list of groups assigned to it.

## Grouping rules
- A group whose max forecast ≤ 150k tokens runs in one session.
- Attach related singles or groups while the total stays ≤ 180k.
- Single-task groups are allowed: the task did not fit, has no related peer, is too big, or needs a model nobody else needs.

## Stages
- **Planning**: files link to each other by path (prompt → groups → tasks).
- **Assembly**: scripts inline everything into final files; the agent reads nothing else.

## Delivery scheme — decision
Options: (1) all task texts up front; (2) start prompt + links, agent reads the next task itself; (3) one task at a time — the agent marks completion in a file a script watches, the script sends the next task into the session.

Take (3), and do not pin a group to an agent at all: hand out the next task to whichever agent has just finished. Two gains under parallel work — even load (fast agents do not wait for slow ones) and tolerance to forecast error (no agent is pre-loaded beyond its window). Groups stay a planning aid: the script prefers to send a task from the same group the agent just worked in, so related context is reused when it exists.

## Notes from the day-16 dispatcher
- The cache does not favour (2) over (3): every turn re-reads the whole window, so cost = window size × turns; the cheapest window holds only the current task text.
- Session reuse accumulates context. The script watches the agent's window (`ctx %` in the terminal / transcript size) and, past a threshold (~150k), runs a handover (`/compact` prompt or a fresh session) before sending the next task.
- Our `dispatcher.mjs` already implements the queue, lanes and acceptance; scheme (3) = adding "keep the session, send the next task" instead of "one workspace per task".
