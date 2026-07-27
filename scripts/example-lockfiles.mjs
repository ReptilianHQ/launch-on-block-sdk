import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const mirroredFields = ["name", "engines", "dependencies", "devDependencies"];

export function validateExampleLockfile(packageJson, lockfile, label = "example package-lock.json") {
  if (lockfile.lockfileVersion !== 3) {
    throw new Error(`${label} must use npm lockfileVersion 3`);
  }
  const rootPackage = lockfile.packages?.[""];
  if (!rootPackage) throw new Error(`${label} is missing its root package entry`);

  for (const field of mirroredFields) {
    const expected = packageJson[field];
    const actual = rootPackage[field];
    if (!isDeepStrictEqual(actual, expected)) {
      throw new Error(`${label} root ${field} does not match package.json`);
    }
  }
}

export function validateExamplePackageFiles(root, packagePath, lockPath) {
  const packageFile = resolve(root, packagePath);
  const lockFile = resolve(root, lockPath);
  if (!existsSync(packageFile)) throw new Error(`required example manifest is missing: ${packagePath}`);
  if (!existsSync(lockFile)) throw new Error(`required example lockfile is missing: ${lockPath}`);
  validateExampleLockfile(
    JSON.parse(readFileSync(packageFile, "utf8")),
    JSON.parse(readFileSync(lockFile, "utf8")),
    lockPath,
  );
}
