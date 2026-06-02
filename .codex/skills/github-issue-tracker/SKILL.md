---
name: github-issue-tracker
description: |
  Track MN Comment Manager bug reports, regressions, fixes, and implementation work in GitHub Issues.
  Use when the user reports something broken, asks to fix or improve behavior, asks to create/update/close
  an issue, or asks to link commits for the MNCommentManager repository.
---

# GitHub Issue Tracker

Use this skill for MN Comment Manager issue tracking.

## Defaults

- GitHub repo: `xkwxdyy/MNCommentManager`.
- This repository contains one plugin only, so issue titles and commit subjects do not need plugin prefixes.
- Do not create titles like `[mncommentmanager] ...` or `[MNCommentManager] ...` unless the user explicitly asks.
- Use `gh issue list --repo xkwxdyy/MNCommentManager --state all --search "<keywords>" --limit 20` before creating a new issue to avoid duplicates.

## Workflow

1. When the user reports a bug, regression, broken behavior, or concrete improvement request, create or update an issue.
2. Keep the issue body factual: user report, environment if known, observed behavior, expected behavior if known, and current branch/commit.
3. During investigation, comment on the issue with root cause, touched files, plan, and meaningful progress.
4. When committing a fix for a tracked issue, reference it in the commit message with `(fixes #123)` or `(refs #123)`.
5. After verification, link the commit and close the issue with a concise resolution summary.

## Commands

Run scripts from this skill directory, or pass the absolute script path.

Create:
```bash
bash .codex/skills/github-issue-tracker/scripts/create_issue.sh "Title without plugin prefix" "Body content"
```

Update:
```bash
bash .codex/skills/github-issue-tracker/scripts/update_issue.sh 123 "Comment text"
```

Link commits:
```bash
bash .codex/skills/github-issue-tracker/scripts/link_commits.sh 123 abc1234 def5678
```

Close:
```bash
bash .codex/skills/github-issue-tracker/scripts/close_issue.sh 123 "Resolution summary"
```

All scripts accept:

- `--repo <owner/repo|url>` to override the default repo.
- `--proxy <url>` to set HTTP(S) proxy.
- `--ref <sha|branch>` for create/update/close link metadata.
- `--file <path[:line]>` for create/update/close code links.
- `--rel-issue <#num|owner/repo#num>` for related issue links.
