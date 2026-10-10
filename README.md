# MN Comment Manager

MN Comment Manager is a MarginNote 4 addon for inspecting and editing comments on the current note card from a WebView panel.

## Features

- Load the focused card and list its comments with type, index, lifecycle stage, and link metadata.
- Filter and search comments by text, image, link, HTML, audio, or other comment types.
- Select single comments, multi-select comments, or pick a continuous range.
- Read and change Comment-level fold state on hosts exposing `commentState()`
  and `setCommentsCollapsed()`. Folded comments retain a two-line preview and
  a small image thumbnail. Search still uses the full content.
- Move selected comments up, down, or to an insertion point.
- Delete selected comments, including long-press bidirectional deletion for pure MarginNote card links.
- Edit supported text comments.
- Merge selected text-like comments into one Markdown comment.
- Extract selected comments into a child note.
- Copy text, copy images, and focus linked notes when supported.
- Select multiple cards and run a saved comment-processing workflow; each step
  is applied to each card separately. Workflows use one undo group unless a
  fold action is included; the host manages fold transactions independently,
  while other consecutive actions keep their own shared undo group.
- Build, reorder, and edit workflow steps from the WebView panel. Workflow
  definitions are stored as native JSON under the MarginNote document folder.
- Extend the action catalog with independent Patch addons. See
  [`patches/README.md`](patches/README.md) and the example patch for the
  versioned registration API.

## Install

Install and enable MN Utils first, then download or build
`mn-comment-manager-v0.1.23.mnaddon` and install it in MarginNote 4.

MN Utils is a required runtime dependency. MN Comment Manager intentionally does
not bundle copies of `MNUtil` or `MNNote`.

## Comment Folding

The disclosure button is at the left of each comment, before its selection
checkbox. The existing header keeps its selection and global commands. Fold
and unfold buttons stay in a separate bottom row while comments scroll.
Hidden selected comments participate, and successful writes preserve selection.
Clicking a selected comment's disclosure applies the inverse of that comment's
current state to the entire selection, including hidden comments. Clicking an
unselected comment's disclosure changes only that comment.
Native excerpts are excluded. Disclosure toggles keep the clicked comment header
visible. The bottom bar's More actions menu reuses existing move, processing
and delete controls, and offers Select all comments including hidden comments.

In the multi-card editor or workflow manager, use `foldSelectedComments` or
`unfoldSelectedComments` with the existing comment selector. Each card uses a
fresh projection revision. Each host call accepts at most 200 comments; larger
selections are rejected without splitting them into partially committed writes.

The plugin detects host capabilities at runtime. Older hosts remain usable but
show an unavailable message for folding. The plugin converts its zero-based
indices to the host's one-based indices, checks the expected revision, and
delegates persistence, rollback, refresh and undo to the host. Failed writes
trigger a readback; stale selections are cleared before another write.

Minimum MarginNote version:

```text
4.2.3
```

Addon id:

```text
marginnote.extension.mncommentmanager
```

## Development

Install dependencies:

```bash
pnpm install
```

Run development mode:

```bash
pnpm dev
```

Build a release package:

```bash
pnpm build
```

The release build generates WebView assets and packages the addon as:

```text
mn-comment-manager-v0.1.23.mnaddon
```

Generate a stable update manifest after uploading the package into the 123pan
MN Comment Manager directory:

```bash
pnpm manifest -- \
  --download-url "https://1826456163.v.123pan.cn/1826456163/28490444" \
  --file-id "28490444"
```

The manifest schema matches the MN Literature / MN Pinner updater manifests and
is written to `debug/123pan/mncommentmanager.json`. The bundled fallback lives in
`src/update-fallback/mncommentmanager.json`. The manifest also includes
`changelogUrl`, which points to the structured changelog JSON used by MNUtils:

```text
https://api.xkwxdyy.cn/update/mncommentmanager_changelog.json
```

Before publishing a package, keep
`src/update-fallback/mncommentmanager_changelog.json` in sync with the user-facing
changes for the released version.

## Project Layout

- `src/`: MarginNote JavaScriptCore addon code.
- `src/main.js`: addon entry and `JSB.require(...)` imports.
- `src/MNCommentManagerAddon.js`: lifecycle hooks and toolbar command.
- `src/WebPanelController.js`: floating WebView panel and bridge URL handling.
- `src/WebBridgeCommands.js`: native bridge command handlers.
- `src/CommentData.js`: current-note comment serialization and capability detection.
- `src/CommentMutations.js`: comment move/delete/edit/merge/extract operations.
- `src/CommentWorkflowStore.js`: native JSON persistence for saved workflows.
- `src/CommentWorkflowRegistry.js`: versioned built-in and Patch action registry.
- `src/CommentWorkflowRunner.js`: sequential batch runner and undo grouping.
- `src/CommentWorkflowMenu.js`: nested batch menu for saved workflows and presets.
- `patches/`: independent Patch API documentation and example addon.
- `src/update-fallback/`: stable update manifest and changelog fallback JSON.
- `web/`: React and Vite source for the panel UI.

## GitHub Issues

This repository contains one plugin, so issue titles do not use plugin prefixes.

The default issue repository is:

```text
xkwxdyy/MNCommentManager
```
