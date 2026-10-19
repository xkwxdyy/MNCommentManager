#!/usr/bin/env python3
"""Validate a local .mnaddon candidate without uploading, deploying, or installing it."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile


def protected_part(part):
    return part.lower() in {".git", "cursor"} or part.lower().startswith(".cursor")


def unsafe_name(value):
    name = PurePosixPath(value)
    return (not value or name.is_absolute() or value != name.as_posix()
            or ".." in name.parts or "\\" in value
            or any(protected_part(part) for part in name.parts))


def local_path(root, value):
    path = Path(value)
    if path.is_absolute() or ".." in path.parts or "\\" in str(value) or any(protected_part(part) for part in path.parts):
        raise ValueError("Expected a repository-relative path")
    current = root
    for part in path.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symbolic links are forbidden")
    resolved = current.resolve(strict=True)
    if resolved != root and root not in resolved.parents:
        raise ValueError("Path escapes the repository")
    return resolved


def source_files(root):
    files = set()
    def visit(directory):
        entries = list(directory.iterdir())
        # Reject protected names before inspecting or descending into any entry.
        if any(unsafe_name(path.relative_to(root).as_posix()) for path in entries):
            raise ValueError("Unsafe source entry")
        for path in entries:
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                raise ValueError("Symbolic links are forbidden")
            if stat.S_ISDIR(mode):
                visit(path)
            elif stat.S_ISREG(mode):
                files.add(path.relative_to(root).as_posix())
            else:
                raise ValueError("Source entries must be regular files or directories")
    visit(root)
    return files


def validate(root, archive, manifest, source_root):
    root = root.resolve(strict=True)
    archive = local_path(root, archive)
    manifest = local_path(root, manifest)
    source_root = local_path(root, source_root)
    if archive.suffix != ".mnaddon" or not source_root.is_dir():
        raise ValueError("Expected a .mnaddon archive and a source directory")
    expected_files = source_files(source_root)
    expected = json.loads(manifest.read_text(encoding="utf-8"))
    with zipfile.ZipFile(archive) as package:
        files = [item for item in package.infolist() if not item.is_dir()]
        if not files or len(files) > 10000 or sum(item.file_size for item in files) > 512 * 1024 * 1024:
            raise ValueError("Unexpected archive size")
        names = [item.filename for item in files]
        if len(names) != len(set(names)) or "mnaddon.json" not in names:
            raise ValueError("Duplicate archive entries or missing root manifest")
        for item in package.infolist():
            name = item.filename[:-1] if item.is_dir() else item.filename
            if unsafe_name(name):
                raise ValueError("Unsafe archive entry")
            if stat.S_ISLNK(item.external_attr >> 16) or item.file_size > 128 * 1024 * 1024:
                raise ValueError("Archive symlinks and oversized entries are forbidden")
        if set(names) != expected_files:
            raise ValueError("Archive/source file set differs")
        for item in files:
            source = local_path(source_root, item.filename)
            if not source.is_file() or hashlib.sha256(package.read(item)).digest() != hashlib.sha256(source.read_bytes()).digest():
                raise ValueError("Archive/source byte parity failed")
        packaged = json.loads(package.read("mnaddon.json").decode("utf-8"))
        for key in ["addonid", "version"]:
            if not isinstance(expected.get(key), str) or not expected[key] or packaged.get(key) != expected[key]:
                raise ValueError("Candidate identity/version differs from source")
    return {"archive": str(archive.relative_to(root)), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "file_count": len(files), "addonid": expected["addonid"], "version": expected["version"],
            "archive_source_parity": True, "device_acceptance": "pending"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--source-root", required=True)
    args = parser.parse_args()
    print(json.dumps(validate(Path(__file__).resolve().parents[1], args.archive, args.manifest, args.source_root), ensure_ascii=False))


if __name__ == "__main__":
    main()
