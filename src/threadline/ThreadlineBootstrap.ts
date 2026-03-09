/**
 * ThreadlineBootstrap — Auto-wires Threadline protocol into the agent server.
 *
 * Called during server boot to:
 *   1. Persist identity keys (Ed25519) across restarts
 *   2. Create HandshakeManager for crypto handshakes
 *   3. Register MCP tools into Claude Code's ~/.claude.json
 *   4. Announce agent presence for discovery
 *   5. Start discovery heartbeat
 *
 * Design: The user never sees any of this. Threadline is ON when the agent boots.
 * The agent IS the interface — users talk to their agent, the agent handles the rest.
 *
 * Part of Threadline Protocol integration (Principle #11: "I am the interface").
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HandshakeManager } from './HandshakeManager.js';
import { AgentDiscovery } from './AgentDiscovery.js';
import { generateIdentityKeyPair } from './ThreadlineCrypto.js';
import type { KeyPair } from './ThreadlineCrypto.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ThreadlineBootstrapConfig {
  /** Agent name */
  agentName: string;
  /** Agent description */
  agentDescription?: string;
  /** State directory for persistence */
  stateDir: string;
  /** Agent's project directory (for MCP registration) */
  projectDir: string;
  /** Server port */
  port: number;
}

export interface ThreadlineBootstrapResult {
  /** Handshake manager for crypto handshakes */
  handshakeManager: HandshakeManager;
  /** Agent discovery service */
  discovery: AgentDiscovery;
  /** Identity key pair */
  identityKeys: KeyPair;
  /** Cleanup function for graceful shutdown */
  shutdown: () => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────

const IDENTITY_KEY_FILE = 'identity-keys.json';

// ── Implementation ───────────────────────────────────────────────────

/**
 * Bootstrap the Threadline protocol stack.
 *
 * Creates the HandshakeManager, registers MCP tools, announces presence,
 * and starts the discovery heartbeat. The ThreadlineRouter is created
 * separately in server.ts because it depends on messaging infrastructure.
 */
export async function bootstrapThreadline(
  config: ThreadlineBootstrapConfig,
): Promise<ThreadlineBootstrapResult> {
  const threadlineDir = path.join(config.stateDir, 'threadline');
  fs.mkdirSync(threadlineDir, { recursive: true });

  // ── 1. Identity Keys (persist across restarts) ───────────────────
  const identityKeys = loadOrCreateIdentityKeys(threadlineDir);

  // ── 2. HandshakeManager ──────────────────────────────────────────
  const handshakeManager = new HandshakeManager(config.stateDir, config.agentName);

  // ── 3. Agent Discovery ───────────────────────────────────────────
  const discovery = new AgentDiscovery({
    stateDir: config.stateDir,
    selfPath: config.projectDir,
    selfName: config.agentName,
    selfPort: config.port,
  });

  // Announce presence for other agents to find us
  discovery.announcePresence({
    capabilities: ['threadline', 'mcp'],
    description: config.agentDescription ?? `${config.agentName} Instar agent`,
    threadlineVersion: '1.0',
    publicKey: identityKeys.publicKey.toString('hex'),
    framework: 'instar',
  });

  // Start heartbeat for liveness detection
  const stopHeartbeat = discovery.startPresenceHeartbeat();

  // ── 4. Register MCP server into Claude Code config ───────────────
  registerThreadlineMcp(config.projectDir, config.agentName, config.stateDir);

  return {
    handshakeManager,
    discovery,
    identityKeys,
    shutdown: async () => {
      stopHeartbeat();
    },
  };
}

// ── Identity Key Persistence ─────────────────────────────────────────

function loadOrCreateIdentityKeys(threadlineDir: string): KeyPair {
  const keyFile = path.join(threadlineDir, IDENTITY_KEY_FILE);

  if (fs.existsSync(keyFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
      if (data.publicKey && data.privateKey) {
        return {
          publicKey: Buffer.from(data.publicKey, 'hex'),
          privateKey: Buffer.from(data.privateKey, 'hex'),
        };
      }
    } catch {
      // Corrupted key file — regenerate
    }
  }

  const keys = generateIdentityKeyPair();

  // Persist atomically
  const tmpFile = `${keyFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify({
    publicKey: keys.publicKey.toString('hex'),
    privateKey: keys.privateKey.toString('hex'),
    createdAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 }); // Private key — restrictive permissions
  fs.renameSync(tmpFile, keyFile);

  return keys;
}

// ── MCP Registration ─────────────────────────────────────────────────

/**
 * Register the Threadline MCP server into Claude Code's config.
 *
 * Uses the same pattern as ensurePlaywrightMcp() — registers in both
 * ~/.claude.json (local scope) and .mcp.json (project scope).
 *
 * The MCP server is a stdio process that Claude Code launches as a subprocess.
 */
function registerThreadlineMcp(projectDir: string, agentName: string, stateDir: string): void {
  const absDir = path.resolve(projectDir);

  // The MCP server entry point — runs as a child process of Claude Code
  const mcpEntry = {
    command: 'node',
    args: [
      path.join(absDir, 'node_modules', 'instar', 'dist', 'threadline', 'mcp-stdio-entry.js'),
      '--state-dir', stateDir,
      '--agent-name', agentName,
    ],
  };

  // ── 1. Register in ~/.claude.json at local scope ──
  const claudeJsonPath = path.join(os.homedir(), '.claude.json');
  try {
    let claudeJson: Record<string, unknown> = {};
    if (fs.existsSync(claudeJsonPath)) {
      claudeJson = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf-8'));
    }

    if (!claudeJson.projects || typeof claudeJson.projects !== 'object') {
      claudeJson.projects = {};
    }
    const projects = claudeJson.projects as Record<string, Record<string, unknown>>;

    if (!projects[absDir]) {
      projects[absDir] = {};
    }
    const projectEntry = projects[absDir];

    if (!projectEntry.mcpServers || typeof projectEntry.mcpServers !== 'object') {
      projectEntry.mcpServers = {};
    }
    const mcpServers = projectEntry.mcpServers as Record<string, unknown>;

    // Register (or update) the Threadline MCP server
    mcpServers.threadline = mcpEntry;

    // Pre-accept trust
    projectEntry.hasTrustDialogAccepted = true;

    // Write atomically
    const tmpPath = `${claudeJsonPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(claudeJson, null, 2));
    fs.renameSync(tmpPath, claudeJsonPath);
  } catch {
    // Non-fatal — .mcp.json fallback below
  }

  // ── 2. Also add to .mcp.json in the project root ──
  const mcpJsonPath = path.join(projectDir, '.mcp.json');
  try {
    let mcpConfig: Record<string, unknown> = {};
    if (fs.existsSync(mcpJsonPath)) {
      mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    }
    if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== 'object') {
      mcpConfig.mcpServers = {};
    }
    const mcpServers = mcpConfig.mcpServers as Record<string, unknown>;
    mcpServers.threadline = mcpEntry;

    const tmpPath = `${mcpJsonPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(mcpConfig, null, 2));
    fs.renameSync(tmpPath, mcpJsonPath);
  } catch {
    // Non-fatal
  }
}
