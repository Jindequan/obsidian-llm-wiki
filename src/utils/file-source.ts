export const VAULT_FILE_PREFIX = 'vault:';

export function encodeVaultFileSource(path: string): string {
	return `${VAULT_FILE_PREFIX}${path.replace(/^\/+/, '')}`;
}

export function decodeVaultFileSource(source: string): string | null {
	if (!source.startsWith(VAULT_FILE_PREFIX)) {
		return null;
	}

	return source.slice(VAULT_FILE_PREFIX.length).replace(/^\/+/, '');
}
