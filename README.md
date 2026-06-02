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

Download or build `mn-comment-manager-v0.1.0.mnaddon`, then install it in MarginNote 4.

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
mn-comment-manager-v0.1.0.mnaddon
```

## Project Layout

- `src/`: MarginNote JavaScriptCore addon code.
- `src/main.js`: addon entry and `JSB.require(...)` imports.
- `src/MNCommentManagerAddon.js`: lifecycle hooks and toolbar command.
- `src/WebPanelController.js`: floating WebView panel and bridge URL handling.
- `src/WebBridgeCommands.js`: native bridge command handlers.
- `src/CommentData.js`: current-note comment serialization and capability detection.
- `src/CommentMutations.js`: comment move/delete/edit/merge/extract operations.
- `web/`: React and Vite source for the panel UI.

## GitHub Issues

This repository contains one plugin, so issue titles do not use plugin prefixes.

The default issue repository is:

```text
xkwxdyy/MNCommentManager
```
