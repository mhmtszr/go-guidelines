import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../..");
const packageJsonPath = resolve(repoRoot, "package.json");
const extensionPath = resolve(repoRoot, ".pi/extensions/go-guidelines.ts");

async function readPackageJson() {
	return JSON.parse(await readFile(packageJsonPath, "utf8"));
}

async function loadExtension() {
	const handlers = new Map();
	const pi = {
		on(event, handler) {
			if (!handlers.has(event)) handlers.set(event, []);
			handlers.get(event).push(handler);
		},
	};

	const extensionUrl = `${pathToFileURL(extensionPath).href}?cachebust=${Date.now()}-${Math.random()}`;
	const extension = await import(extensionUrl);
	extension.default(pi);

	return handlers;
}

test("package.json declares Pi skill and extension resources", async () => {
	const pkg = await readPackageJson();

	assert.ok(pkg.keywords.includes("pi-package"));
	assert.deepEqual(pkg.pi.skills, ["./skills"]);
	assert.deepEqual(pkg.pi.extensions, ["./.pi/extensions/go-guidelines.ts"]);
});

test("Pi extension registers the bundled skills directory", async () => {
	const handlers = await loadExtension();
	const discoverHandlers = handlers.get("resources_discover") ?? [];

	assert.equal(discoverHandlers.length, 1);
	const result = await discoverHandlers[0]();
	assert.deepEqual(result, { skillPaths: [resolve(repoRoot, "skills")] });
});
