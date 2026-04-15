type DesktopRequire = (module: string) => unknown;

interface ElectronModule {
	webUtils?: {
		getPathForFile?: (target: File) => string;
	};
	shell?: {
		openPath: (targetPath: string) => Promise<string>;
	};
}

interface NodeFsModule {
	readFileSync(path: string, encoding: 'utf-8'): string;
	readFileSync(path: string): Uint8Array;
}

function getDesktopRequire(): DesktopRequire | null {
	const desktopWindow = window as Window & {
		require?: DesktopRequire;
	};

	return desktopWindow.require ?? null;
}

export function getElectronModule(): ElectronModule | null {
	const desktopRequire = getDesktopRequire();
	if (!desktopRequire) {
		return null;
	}

	try {
		const electronModule = desktopRequire('electron');
		if (electronModule && typeof electronModule === 'object') {
			return electronModule as ElectronModule;
		}
	} catch {
		// Desktop-only capability is not available in the current environment.
	}

	return null;
}

export function getNodeFsModule(): NodeFsModule | null {
	const desktopRequire = getDesktopRequire();
	if (!desktopRequire) {
		return null;
	}

	try {
		const fsModule = desktopRequire('fs');
		if (fsModule && typeof fsModule === 'object') {
			return fsModule as NodeFsModule;
		}
	} catch {
		// Desktop-only capability is not available in the current environment.
	}

	return null;
}

export function getDesktopFilePath(file: File): string | null {
	return getElectronModule()?.webUtils?.getPathForFile?.(file) ?? null;
}

export function readLocalTextFile(filePath: string): string {
	const fsModule = getNodeFsModule();
	if (!fsModule) {
		throw new Error('Local file access is only available in the desktop app.');
	}

	return fsModule.readFileSync(filePath, 'utf-8');
}

export function readLocalBinaryFile(filePath: string): Uint8Array {
	const fsModule = getNodeFsModule();
	if (!fsModule) {
		throw new Error('Local file access is only available in the desktop app.');
	}

	return fsModule.readFileSync(filePath);
}

export async function openSystemPath(path: string): Promise<string | null> {
	const shell = getElectronModule()?.shell;
	if (!shell) {
		return null;
	}

	return shell.openPath(path);
}
