#!/usr/bin/env node
/**
 * Elsor Discord Bridge
 *
 * Bridges Discord messages to the Elsor agent via `claude -p`.
 * Messages in the configured channel are forwarded to Elsor,
 * and executive briefings are posted back as replies.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=xxx DISCORD_CHANNEL_ID=xxx node scripts/elsor-discord.js
 *
 * Environment variables:
 *   DISCORD_BOT_TOKEN   — Bot token from Discord Developer Portal
 *   DISCORD_CHANNEL_ID  — Channel ID where Elsor listens
 *   ELSOR_PROJECT_DIR   — Path to the project repo (default: cwd)
 *   ANTHROPIC_API_KEY   — Required by Claude Code
 */

const { spawn } = require('child_process');
const https = require('https');
const { URL } = require('url');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PROJECT_DIR = process.env.ELSOR_PROJECT_DIR || process.cwd();
const API_BASE = 'https://discord.com/api/v10';
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID');
  process.exit(1);
}

// --- HTTP helpers (no external dependencies) ---

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch { resolve(chunks); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sendMessage(channelId, content) {
  // Discord max message length is 2000 chars
  const chunks = [];
  while (content.length > 0) {
    chunks.push(content.slice(0, 1990));
    content = content.slice(1990);
  }
  return chunks.reduce((p, chunk) =>
    p.then(() => apiRequest('POST', `/channels/${channelId}/messages`, { content: chunk })),
    Promise.resolve()
  );
}

function sendTyping(channelId) {
  return apiRequest('POST', `/channels/${channelId}/typing`);
}

// --- Claude bridge ---

const activeRequests = new Set();

function runElsor(userMessage) {
  return new Promise((resolve, reject) => {
    const prompt = `Use the elsor agent. The user says: ${userMessage}`;
    const proc = spawn('claude', ['-p', '--agent', 'elsor', prompt], {
      cwd: PROJECT_DIR,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 600000, // 10 minute max
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else if (stdout.trim()) {
        resolve(stdout.trim());
      } else {
        resolve(`Elsor encountered an issue.\n\`\`\`\n${stderr.slice(0, 500) || 'No output'}\n\`\`\``);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start claude: ${err.message}`));
    });
  });
}

// --- WebSocket Gateway (zero dependencies) ---

let ws;
let heartbeatInterval;
let seq = null;
let sessionId = null;
let resumeUrl = null;
let botUserId = null;

function connectGateway() {
  const WebSocket = require('ws') || null;

  // Fallback: if ws module not available, use polling
  if (!WebSocket) {
    console.log('ws module not found. Install it: npm install ws');
    console.log('Falling back to HTTP polling mode...');
    startPolling();
    return;
  }

  ws = new WebSocket(GATEWAY_URL);

  ws.on('open', () => {
    console.log('[Elsor] Connected to Discord Gateway');
  });

  ws.on('message', (data) => {
    const payload = JSON.parse(data.toString());
    const { op, t, d, s } = payload;

    if (s) seq = s;

    switch (op) {
      case 10: // Hello
        heartbeatInterval = setInterval(() => {
          ws.send(JSON.stringify({ op: 1, d: seq }));
        }, d.heartbeat_interval);

        // Identify
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: BOT_TOKEN,
            intents: (1 << 9) | (1 << 15), // GUILD_MESSAGES | MESSAGE_CONTENT
            properties: { os: 'linux', browser: 'elsor', device: 'elsor' },
          },
        }));
        break;

      case 11: // Heartbeat ACK
        break;

      case 7: // Reconnect
        console.log('[Elsor] Reconnect requested');
        ws.close();
        setTimeout(connectGateway, 2000);
        break;

      case 9: // Invalid session
        console.log('[Elsor] Invalid session, re-identifying...');
        sessionId = null;
        ws.close();
        setTimeout(connectGateway, 5000);
        break;
    }

    // Events
    if (op === 0) {
      switch (t) {
        case 'READY':
          sessionId = d.session_id;
          resumeUrl = d.resume_gateway_url;
          botUserId = d.user.id;
          console.log(`[Elsor] Bot online as ${d.user.username}#${d.user.discriminator}`);
          console.log(`[Elsor] Listening in channel ${CHANNEL_ID}`);
          break;

        case 'MESSAGE_CREATE':
          handleMessage(d);
          break;
      }
    }
  });

  ws.on('close', (code) => {
    console.log(`[Elsor] Gateway closed (${code}), reconnecting...`);
    clearInterval(heartbeatInterval);
    setTimeout(connectGateway, 5000);
  });

  ws.on('error', (err) => {
    console.error(`[Elsor] Gateway error: ${err.message}`);
  });
}

async function handleMessage(msg) {
  // Ignore bot messages, other channels, and system messages
  if (msg.author.bot) return;
  if (msg.channel_id !== CHANNEL_ID) return;
  if (!msg.content || msg.content.trim().length === 0) return;

  const userMessage = msg.content.trim();
  const requestId = `${msg.id}`;

  // Prevent duplicate processing
  if (activeRequests.has(requestId)) return;
  activeRequests.add(requestId);

  console.log(`[Elsor] Request from ${msg.author.username}: ${userMessage.slice(0, 80)}...`);

  try {
    // Show typing indicator
    await sendTyping(CHANNEL_ID);

    // Keep typing indicator alive while Elsor works
    const typingTimer = setInterval(() => sendTyping(CHANNEL_ID), 8000);

    const response = await runElsor(userMessage);

    clearInterval(typingTimer);

    // Send response
    await sendMessage(CHANNEL_ID, response);
    console.log(`[Elsor] Responded (${response.length} chars)`);
  } catch (err) {
    console.error(`[Elsor] Error: ${err.message}`);
    await sendMessage(CHANNEL_ID, `Elsor error: ${err.message}`);
  } finally {
    activeRequests.delete(requestId);
  }
}

// --- Polling fallback (if ws module unavailable) ---

let lastMessageId = null;

async function pollMessages() {
  try {
    const path = `/channels/${CHANNEL_ID}/messages?limit=5${lastMessageId ? `&after=${lastMessageId}` : ''}`;
    const messages = await apiRequest('GET', path);

    if (!Array.isArray(messages)) return;

    // Sort oldest first
    messages.sort((a, b) => BigInt(a.id) > BigInt(b.id) ? 1 : -1);

    for (const msg of messages) {
      if (lastMessageId && BigInt(msg.id) <= BigInt(lastMessageId)) continue;
      lastMessageId = msg.id;
      await handleMessage(msg);
    }
  } catch (err) {
    console.error(`[Elsor] Poll error: ${err.message}`);
  }
}

function startPolling() {
  console.log('[Elsor] Starting HTTP polling mode (every 3s)');
  // Get latest message ID first
  apiRequest('GET', `/channels/${CHANNEL_ID}/messages?limit=1`).then((msgs) => {
    if (Array.isArray(msgs) && msgs.length) lastMessageId = msgs[0].id;
    setInterval(pollMessages, 3000);
  });
}

// --- Start ---

console.log('[Elsor] Discord bridge starting...');
console.log(`[Elsor] Project dir: ${PROJECT_DIR}`);

try {
  require.resolve('ws');
  connectGateway();
} catch {
  console.log('[Elsor] ws module not installed, using HTTP polling');
  startPolling();
}
