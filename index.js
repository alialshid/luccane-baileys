import makeWASocketDefault, * as baileys from "@whiskeysockets/baileys"
import pino from "pino"
import fs from "fs"
import readline from "readline"

// ================= UNIVERSAL COMPAT =================
const makeWASocket =
  makeWASocketDefault ||
  baileys.makeWASocket ||
  baileys.default

const useMultiFileAuthState =
  baileys.useMultiFileAuthState ||
  baileys.default?.useMultiFileAuthState

const DisconnectReason = baileys.DisconnectReason

if (!makeWASocket || !useMultiFileAuthState) {
  console.log("❌ Baileys tidak kompatibel / salah versi!")
  process.exit(1)
}

// ================= CONFIG =================
const CONFIG = {
  delaySend: 1200,
  maxBulk: 5,
  cooldown: 4000
}

// ================= DETECT PANEL =================
const isPanel = !process.stdout.isTTY

// ================= INPUT NOMOR =================
async function askNumber() {
  if (isPanel) {
    console.log("⚠️ Panel detected, pakai pairing manual (env)")
    return process.env.NUMBER || "628xxx"
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question("📱 Masukkan Nomor (628xxx): ", (num) => {
      rl.close()
      resolve(num)
    })
  })
}

// ================= UTILS =================
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function normalizeJid(jid) {
  if (!jid) return jid
  return jid.includes(":") ? jid.split(":")[0] : jid
}

function isSafeJid(jid) {
  return !jid.includes("broadcast") && !jid.includes("status")
}

function clearSession() {
  if (fs.existsSync("./session")) {
    fs.rmSync("./session", { recursive: true, force: true })
  }
}

// ================= QUEUE =================
let messageQueue = []
let isProcessing = false

async function safeSend(sock, jid, content) {
  jid = normalizeJid(jid)
  if (!isSafeJid(jid)) return

  await sleep(CONFIG.delaySend)
  return await sock.sendMessage(jid, content)
}

async function processQueue(sock) {
  if (isProcessing) return
  isProcessing = true

  while (messageQueue.length > 0) {
    let batch = messageQueue.splice(0, CONFIG.maxBulk)

    for (let msg of batch) {
      await safeSend(sock, msg.jid, msg.content)
    }

    await sleep(CONFIG.cooldown)
  }

  isProcessing = false
}

function sendQueue(sock, jid, content) {
  messageQueue.push({ jid, content })
  processQueue(sock)
}

// ================= START =================
async function startLuccane() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: ["LUCCANEE UNIVERSAL", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  // ===== PAIRING =====
  if (!sock.authState.creds.registered) {
    const phoneNumber = await askNumber()

    try {
      const code = await sock.requestPairingCode(phoneNumber)
      const formatted = code?.match(/.{1,4}/g)?.join("-") || code

      console.log(`
╭━━━〔 LUCCANEE PAIRING 〕━━━⬣
┃ 📱 Number : ${phoneNumber}
┃ 🔐 Code   : ${formatted}
╰━━━━━━━━━━━━━━━━━━━━⬣`)
    } catch (e) {
      console.log("❌ Pairing gagal:", e)
    }
  }

  // ===== CONNECTION =====
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update

    if (connection === "close") {
      let reason = lastDisconnect?.error?.output?.statusCode

      if (reason === DisconnectReason.loggedOut) {
        console.log("⚠️ Session logout, reset...")
        clearSession()
      }

      console.log("🔄 Reconnecting...")
      startLuccane()

    } else if (connection === "open") {
      console.log("✅ CONNECTED LUCCANEE")
    }
  })

  // ===== MESSAGE =====
  sock.ev.on("messages.upsert", async ({ messages }) => {
    let m = messages[0]
    if (!m.message) return

    let jid = normalizeJid(m.key.remoteJid)
    let text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      ""

    console.log("📩", jid, ":", text)

    if (text === ".ping") {
      sendQueue(sock, jid, { text: "🏓 Pong!" })
    }

    if (text === ".menu") {
      sendQueue(sock, jid, {
        text: `🔥 LUCCANEE UNIVERSAL BOT 🔥

• .ping
• .menu

✔ Support semua SC
✔ Support semua panel
✔ Pairing + QR ready
✔ Anti delay + queue system`
      })
    }
  })
}

// ================= ERROR HANDLER =================
process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

// ================= RUN =================
startLuccane()
