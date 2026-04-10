import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

const buildMainPath = path.join(rootDir, '.build', 'main.js');
const manifestPath = path.join(rootDir, 'manifest.json');
const versionsPath = path.join(rootDir, 'versions.json');
const releaseDir = path.join(rootDir, '.release', version);
const archivePath = path.join(rootDir, '.release', `obsidian-llm-wiki-${version}.zip`);

if (!fs.existsSync(buildMainPath)) {
	throw new Error(`Build artifact not found: ${buildMainPath}`);
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.copyFileSync(buildMainPath, path.join(releaseDir, 'main.js'));
fs.copyFileSync(manifestPath, path.join(releaseDir, 'manifest.json'));
fs.copyFileSync(versionsPath, path.join(releaseDir, 'versions.json'));

if (fs.existsSync(archivePath)) {
	fs.rmSync(archivePath);
}

execFileSync(
	'zip',
	[
		'-j',
		archivePath,
		path.join(releaseDir, 'main.js'),
		path.join(releaseDir, 'manifest.json'),
		path.join(releaseDir, 'versions.json'),
	],
	{ stdio: 'inherit' }
);

console.log(`Prepared release assets in ${releaseDir}`);
console.log(`Prepared release archive at ${archivePath}`);
