Dispatcher message — task {{TASK_ID}} «{{TITLE}}», PR #{{PR_NUMBER}} ({{PR_URL}}) was REJECTED by the acceptor (round {{ROUND}}). Findings, verbatim:

{{FINDINGS}}

Fix every numbered finding in this worktree ({{WORKTREE}}, branch {{BRANCH}}): measure first, then change, then re-measure. Commit as before (`IVAN_OK=1 git add -- <paths> && IVAN_OK=1 git commit -q -m "fix(<scope>): <finding> ({{TASK_ID}})" -- <paths>`), `git push` to the same branch, then `gh pr comment {{PR_NUMBER}} --body "<per finding: what changed, command + output that proves it>"`, append a line to {{MISSION_DIR}}/logs/workers.log, and stop. If a finding is wrong, say so in the PR comment with the measurement that shows it. Do not merge.
