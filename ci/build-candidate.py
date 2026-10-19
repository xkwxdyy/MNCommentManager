#!/usr/bin/env python3
"""Build one verified local candidate in a disposable source copy; never publish."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def protected(directory, names):
    excluded = [name for name in names if name in {'node_modules', '.git', '.DS_Store'} or name.lower() == 'cursor' or name.lower().startswith('.cursor')]
    if any((Path(directory) / name).is_symlink() for name in names if name not in excluded):
        raise ValueError('Build source inputs must not follow external symbolic links')
    return excluded


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', default='artifacts')
    args = parser.parse_args()
    output = (root / args.output_dir).resolve()
    if output != root and root not in output.parents:
        parser.error('The candidate output must remain in the checkout')
    version = subprocess.run(['node', '--version'], capture_output=True, text=True, check=True).stdout.strip()
    if not version.startswith('v24.'):
        parser.error('Node 24 is required')
    inputs = [root / 'package.json', root / 'pnpm-lock.yaml', root / 'src/mnaddon.json']
    original = {str(path.relative_to(root)): sha(path) for path in inputs}
    package = json.loads(inputs[0].read_text())
    manifest = json.loads(inputs[2].read_text())
    if package['version'] != manifest['version']:
        raise ValueError('Package and addon versions differ before building')
    dependencies = root / 'node_modules'
    if not dependencies.is_dir():
        raise ValueError('Install the locked dependencies with lifecycle scripts disabled first')
    spec = importlib.util.spec_from_file_location('candidate_validation', root / 'ci/validate-candidate.py')
    validator = importlib.util.module_from_spec(spec); spec.loader.exec_module(validator)
    with tempfile.TemporaryDirectory(prefix='mncommentmanager-candidate-') as temporary:
        staging = Path(temporary)
        for name in ('src', 'web', 'scripts', 'assets', 'images', 'patches'):
            if (root / name).is_dir():
                shutil.copytree(root / name, staging / name, ignore=protected, symlinks=False)
        for path in inputs[:2]:
            shutil.copy2(path, staging / path.name)
        (staging / 'node_modules').symlink_to(dependencies.resolve(), target_is_directory=True)
        # This existing demo regression needs a generated, ignored HTML preview.
        # Rebuild and exercise it before the addon builder recreates dist.
        subprocess.run(['node', 'web/demos/comment-move/build-overview.mjs'], cwd=staging, check=True)
        subprocess.run(['node', 'web/demos/comment-move/test-overview.mjs'], cwd=staging, check=True)
        subprocess.run(['node', 'scripts/build-release.js'], cwd=staging, check=True)
        # This existing regression intentionally requires generated WebView
        # files, which are absent from a fresh checkout until the build above.
        subprocess.run(['node', 'scripts/test-web-entry-release-hygiene.js'], cwd=staging, check=True)
        name = package['name'].strip().lstrip('@').replace('/', '-') + '-v' + package['version'] + '.mnaddon'
        result = validator.validate(staging, name, 'src/mnaddon.json', 'dist')
        for script in sorted((staging / 'dist').rglob('*.js')):
            subprocess.run(['node', '--check', str(script)], check=True, capture_output=True)
        archive = staging / name
        output.mkdir(parents=True, exist_ok=True)
        destination = output / name
        if destination.exists() and sha(destination) != sha(archive):
            raise ValueError('Refusing to overwrite a different existing candidate')
        if not destination.exists():
            shutil.copy2(archive, destination)
        for path in inputs:
            if sha(path) != original[str(path.relative_to(root))]:
                raise ValueError('The original identity/version/lock inputs changed')
        result.update({'archive': name, 'node': version, 'source_inputs_unchanged': original,
                       'build_isolated': True, 'build_command': ['node', 'scripts/build-release.js'],
                       'published_uploaded_installed_or_versioned': False})
        (output / 'candidate-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
