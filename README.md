# MN Comment Manager

MN Comment Manager is a MarginNote 4 addon for inspecting and editing comments on the current note card from a WebView panel.

## Features

- Load the focused card and list its comments with type, index, lifecycle stage, and link metadata.
- Filter and search comments by text, image, link, HTML, audio, or other comment types.
- Select single comments, multi-select comments, or pick a continuous range.
- Move selected comments up, down, or to an insertion point.
- Delete selected comments, including long-press bidirectional deletion for pure MarginNote card links.
- Edit supported text comments.
- Merge selected text-like comments into one Markdown comment.
- Extract selected comments into a child note.
- Copy text, copy images, and focus linked notes when supported.

## Install

Download or build `mn-comment-manager-v0.1.8.mnaddon`, then install it in MarginNote 4.

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
mn-comment-manager-v0.1.8.mnaddon
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
- `src/update-fallback/`: stable update manifest and changelog fallback JSON.
- `web/`: React and Vite source for the panel UI.

## GitHub Issues

This repository contains one plugin, so issue titles do not use plugin prefixes.

The default issue repository is:

```text
xkwxdyy/MNCommentManager
```
