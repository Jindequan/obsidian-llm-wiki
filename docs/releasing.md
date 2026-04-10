# Releasing LLM Wiki

This document is for maintainers of the plugin repository.

## Release Assets

Each GitHub release should publish:

- `main.js`
- `manifest.json`
- `versions.json`

The repository includes `version-bump.mjs` to keep `manifest.json` and `versions.json` aligned with `package.json`.
The compiled bundle is written to `.build/main.js`.
Release-ready assets are assembled under `.release/<version>/`.

## Automated Release Flow

This repository uses a single-repository release workflow:

1. Update the version in `package.json`
2. Run `npm run version`
3. Commit `package.json`, `manifest.json`, and `versions.json`
4. Push the commit
5. Create a tag such as `0.1.0`
6. Push the tag
7. Let `.github/workflows/release.yml` build the plugin and publish the GitHub Release automatically

## Release Checklist

Before publishing a new version:

1. Update `package.json`
2. Run `npm run version`
3. Run `npm run build`
4. Run `npm run package:release` if you want to inspect the local release bundle
5. Verify that `.release/<version>/main.js`, `manifest.json`, and `versions.json` are present
6. Push a version tag such as `0.1.0`
7. Confirm that GitHub Actions created the release assets automatically

## Obsidian Community Plugin Submission

To submit this plugin to the official Obsidian community plugin directory:

1. Make sure this repository is public
2. Make sure the repository has a GitHub release containing:
   - `main.js`
   - `manifest.json`
   - `versions.json`
3. Make sure `manifest.json` contains the final plugin id, name, author, and version
4. Prepare a clear README and usage notes
5. Submit a PR to [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)

## Notes

- Obsidian community plugins require a public source repository
- The plugin id in `manifest.json` should remain stable once submitted
- The tag and release name pushed to GitHub must exactly match the version in `package.json` with no `v` prefix
