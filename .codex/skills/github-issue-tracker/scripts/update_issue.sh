#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO="xkwxdyy/MNCommentManager"
PROXY_URL="${GITHUB_PROXY:-${CLASH_HTTP_PROXY:-}}"
REPO_INPUT="$DEFAULT_REPO"
REF_INPUT=""
FILES=()
RELATED_ISSUES=()
POSITIONAL=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --proxy) PROXY_URL="$2"; shift 2 ;;
    --proxy=*) PROXY_URL="${1#*=}"; shift ;;
    --repo) REPO_INPUT="$2"; shift 2 ;;
    --repo=*) REPO_INPUT="${1#*=}"; shift ;;
    --ref) REF_INPUT="$2"; shift 2 ;;
    --ref=*) REF_INPUT="${1#*=}"; shift ;;
    --file) FILES+=("$2"); shift 2 ;;
    --file=*) FILES+=("${1#*=}"); shift ;;
    --rel-issue) RELATED_ISSUES+=("$2"); shift 2 ;;
    --rel-issue=*) RELATED_ISSUES+=("${1#*=}"); shift ;;
    --) shift; break ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

set -- "${POSITIONAL[@]}"
ISSUE_NUMBER="${1:-}"
COMMENT="${2:-}"

if [ -z "$ISSUE_NUMBER" ] || [ -z "$COMMENT" ]; then
  echo "Usage: $0 [--repo <owner/repo|url>] [--ref <sha|branch>] [--file <path[:line]>] [--rel-issue <#num|owner/repo#num>] <issue_number> \"Comment text\"" >&2
  exit 1
fi

if [ -n "$PROXY_URL" ]; then
  export HTTPS_PROXY="$PROXY_URL" HTTP_PROXY="$PROXY_URL" https_proxy="$PROXY_URL" http_proxy="$PROXY_URL"
fi
if [ -n "${CLASH_SOCKS_PROXY:-}" ] && [ -z "${ALL_PROXY:-}" ] && [ -z "${all_proxy:-}" ]; then
  export ALL_PROXY="$CLASH_SOCKS_PROXY" all_proxy="$CLASH_SOCKS_PROXY"
fi

if [[ "$REPO_INPUT" == http* ]]; then
  REPO_URL="${REPO_INPUT%/}"
  REPO_NAME="${REPO_URL#https://github.com/}"
else
  REPO_NAME="$REPO_INPUT"
  REPO_URL="https://github.com/$REPO_INPUT"
fi

REF="$REF_INPUT"
if [ -z "$REF" ]; then
  REF="$(git rev-parse HEAD 2>/dev/null || true)"
fi
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [ "$BRANCH" = "HEAD" ]; then
  BRANCH=""
fi

LINK_SECTION=""
if [ -n "$REF" ] || [ -n "$BRANCH" ] || [ "${#FILES[@]}" -gt 0 ] || [ "${#RELATED_ISSUES[@]}" -gt 0 ]; then
  LINK_SECTION=$'\n\n## Related Links\n'
  LINK_SECTION+="- Repo: $REPO_URL"$'\n'
  if [ -n "$REF" ]; then
    LINK_SECTION+="- Commit: $REPO_NAME@$REF"$'\n'
  fi
  if [ -n "$BRANCH" ]; then
    LINK_SECTION+="- Branch: [$BRANCH]($REPO_URL/tree/$BRANCH)"$'\n'
  fi
  for ISSUE in "${RELATED_ISSUES[@]}"; do
    if [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
      ISSUE="#$ISSUE"
    fi
    LINK_SECTION+="- Related issue: $ISSUE"$'\n'
  done
  for FILE in "${FILES[@]}"; do
    PATH_PART="$FILE"
    LINE_PART=""
    if [[ "$FILE" == *#L* ]]; then
      PATH_PART="${FILE%%#L*}"
      LINE_PART="${FILE##*#L}"
    elif [[ "$FILE" == *:* ]]; then
      PATH_PART="${FILE%%:*}"
      LINE_PART="${FILE##*:}"
    fi
    DISPLAY="$PATH_PART"
    URL="$REPO_URL/blob/${REF:-HEAD}/$PATH_PART"
    if [ -n "$LINE_PART" ]; then
      DISPLAY="$PATH_PART#L$LINE_PART"
      URL="$URL#L$LINE_PART"
    fi
    LINK_SECTION+="- Code: [$DISPLAY]($URL)"$'\n'
  done
fi

gh issue comment "$ISSUE_NUMBER" --repo "$REPO_NAME" --body "$COMMENT$LINK_SECTION"
echo "Added comment to issue #$ISSUE_NUMBER"
