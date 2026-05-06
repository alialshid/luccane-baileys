import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys"

import pino from "pino"
import fs from "fs"
import readline from "readline"

// ================= CONFIG =================
const CONFIG = {
  delaySend: 1200,
  maxBulk: 5,
  cooldown: 4000
}

// ================= INPUT NOMOR =================
function askNumber() {
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
    printQRInTerminal: true,
    browser: ["Luccane Mods", "Chrome", "1.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  // ================= PAIRING CODE =================
  if (!sock.authState.creds.registered) {
    const phoneNumber = await askNumber()
    const code = await sock.requestPairingCode(phoneNumber)
    console.log(`🔑 Pairing Code: ${code}`)
  }

  // ================= CONNECTION =================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update

    if (connection === "close") {
      let reason = lastDisconnect?.error?.output?.statusCode

      if (reason === DisconnectReason.loggedOut) {
        console.log("⚠️ Session rusak, reset...")
        clearSession()
        startLuccane()
      } else {
        console.log("🔄 Reconnecting...")
        startLuccane()
      }
    } else if (connection === "open") {
      console.log("✅ Luccane Connected")
    }
  })

  // ================= MESSAGE =================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    let m = messages[0]
    if (!m.message) return

    let jid = m.key.remoteJid
    let text =
      m.message.conversation ||
      m.message.extendedTextMessage?.text ||
      ""

    console.log("📩", jid, ":", text)

    // ====== COMMAND ======
    if (text === ".ping") {
      sendQueue(sock, jid, { text: "Pong dari Luccane 🏓" })
    }

    if (text === ".menu") {
      sendQueue(sock, jid, {
        text: `🔥 LUCCANE BAILEYS 🔥

• .ping
• .menu

Mode:
✔ Pairing Code
✔ QR Login
✔ Anti Limit
✔ Anti Spam`
      })
    }
  })
}

// ================= ERROR HANDLER =================
process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

// ================= RUN =================
startLuccane()
