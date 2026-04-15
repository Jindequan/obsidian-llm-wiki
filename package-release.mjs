import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const version = packageJson.version;
const pluginId = manifest.id;

const buildMainPath = path.join(rootDir, '.build', 'main.js');
const manifestPath = path.join(rootDir, 'manifest.json');
const versionsPath = path.join(rootDir, 'versions.json');
const stylesPath = path.join(rootDir, 'styles.css');
const releaseDir = path.join(rootDir, '.release', version);
const archivePath = path.join(rootDir, '.release', `${pluginId}-${version}.zip`);

if (!fs.existsSync(buildMainPath)) {
	throw new Error(`Build artifact not found: ${buildMainPath}`);
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.copyFileSync(buildMainPath, path.join(releaseDir, 'main.js'));
fs.copyFileSync(manifestPath, path.join(releaseDir, 'manifest.json'));
fs.copyFileSync(versionsPath, path.join(releaseDir, 'versions.json'));
if (fs.existsSync(stylesPath)) {
	fs.copyFileSync(stylesPath, path.join(releaseDir, 'styles.css'));
}

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
		...(fs.existsSync(stylesPath) ? [path.join(releaseDir, 'styles.css')] : []),
	],
	{ stdio: 'inherit' }
);

process.stdout.write(`Prepared release assets in ${releaseDir}\n`);
process.stdout.write(`Prepared release archive at ${archivePath}\n`);
