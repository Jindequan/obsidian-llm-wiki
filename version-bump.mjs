import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const manifestPath = new URL('./manifest.json', import.meta.url);
const versionsPath = new URL('./versions.json', import.meta.url);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const versions = fs.existsSync(versionsPath)
	? JSON.parse(fs.readFileSync(versionsPath, 'utf8'))
	: {};

manifest.version = packageJson.version;
versions[packageJson.version] = manifest.minAppVersion;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
fs.writeFileSync(versionsPath, `${JSON.stringify(versions, null, '\t')}\n`);
