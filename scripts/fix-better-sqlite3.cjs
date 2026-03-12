#!/usr/bin/env node
/**
 * fix-better-sqlite3.cjs
 *
 * Ensures better-sqlite3 has the correct native binary for the current Node.js version.
 * prebuild-install sometimes downloads the wrong ABI version (especially on Node 25+).
 * This script detects the mismatch and fetches the correct prebuild from GitHub.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MODULE_VERSION = process.versions.modules;
const ARCH = process.arch;
const PLATFORM = process.platform;

// Find better-sqlite3 location (works with both pnpm and npm node_modules)
function findBetterSqlite3() {
  try {
    const resolved = require.resolve('better-sqlite3/package.json');
    return path.dirname(resolved);
  } catch {
    return null;
  }
}

function getBetterSqliteVersion(pkgDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  return pkg.version;
}

function testBinary(pkgDir) {
  // Spawn a completely fresh node process to avoid any require cache
  try {
    execSync(
      `node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close();"`,
      { stdio: 'pipe', timeout: 5000, cwd: pkgDir }
    );
    return true;
  } catch {
    return false;
  }
}

function main() {
  const pkgDir = findBetterSqlite3();
  if (!pkgDir) {
    console.log('[fix-better-sqlite3] better-sqlite3 not found, skipping.');
    return;
  }

  const version = getBetterSqliteVersion(pkgDir);
  console.log(`[fix-better-sqlite3] Found better-sqlite3@${version} at ${pkgDir}`);
  console.log(`[fix-better-sqlite3] Node MODULE_VERSION=${MODULE_VERSION}, arch=${ARCH}, platform=${PLATFORM}`);

  // Test if current binary works
  if (testBinary(pkgDir)) {
    console.log('[fix-better-sqlite3] Native binary is working correctly.');
    return;
  }

  console.log('[fix-better-sqlite3] Native binary mismatch detected. Fetching correct prebuild...');

  const prebuildName = `better-sqlite3-v${version}-node-v${MODULE_VERSION}-${PLATFORM}-${ARCH}.tar.gz`;
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${prebuildName}`;
  const tmpFile = path.join(require('os').tmpdir(), prebuildName);
  const buildDir = path.join(pkgDir, 'build');

  try {
    // Download
    console.log(`[fix-better-sqlite3] Downloading ${url}`);
    execSync(`curl -L -f -o "${tmpFile}" "${url}"`, { stdio: 'pipe', timeout: 30000 });

    // Clean old build and extract
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true });
    }
    execSync(`tar xzf "${tmpFile}" -C "${pkgDir}"`, { stdio: 'pipe' });

    // Verify
    if (testBinary(pkgDir)) {
      console.log('[fix-better-sqlite3] Successfully installed correct prebuild.');
    } else {
      console.error('[fix-better-sqlite3] WARNING: Installed prebuild but it still fails to load.');
      console.error('[fix-better-sqlite3] You may need to use a different Node.js version.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`[fix-better-sqlite3] Failed to fetch prebuild: ${err.message}`);
    console.error(`[fix-better-sqlite3] No prebuild available for node-v${MODULE_VERSION}-${PLATFORM}-${ARCH}`);
    console.error('[fix-better-sqlite3] Try using Node 22 LTS or Node 24 instead.');
    process.exit(1);
  } finally {
    // Cleanup temp file
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

main();
