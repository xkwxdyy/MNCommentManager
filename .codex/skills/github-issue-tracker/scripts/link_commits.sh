#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO="xkwxdyy/MNCommentManager"
PROXY_URL="${GITHUB_PROXY:-${CLASH_HTTP_PROXY:-}}"
REPO_INPUT="$DEFAULT_REPO"
POSITIONAL=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --proxy) PROXY_URL="$2"; shift 2 ;;
    --proxy=*) PROXY_URL="${1#*=}"; shift ;;
    --repo) REPO_INPUT="$2"; shift 2 ;;
    --repo=*) REPO_INPUT="${1#*=}"; shift ;;
    --) shift; break ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

set -- "${POSITIONAL[@]}"
ISSUE_NUMBER="${1:-}"
if [ "$#" -gt 0 ]; then
  shift
fi

if [ -z "$ISSUE_NUMBER" ] || [ "$#" -eq 0 ]; then
  echo "Usage: $0 [--repo <owner/repo|url>] <issue_number> <commit_hash1> [commit_hash2] ..." >&2
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

COMMIT_LIST="## Related Commits\n\n"
for COMMIT in "$@"; do
  MSG="$(git log -1 --pretty=format:%s "$COMMIT" 2>/dev/null || echo "Unknown commit")"
  COMMIT_LIST+="- [$COMMIT]($REPO_URL/commit/$COMMIT) - $MSG\n"
done

gh issue comment "$ISSUE_NUMBER" --repo "$REPO_NAME" --body "$(printf "%b" "$COMMIT_LIST")"
echo "Linked commits to issue #$ISSUE_NUMBER"
