export function smsg(sock, m) {
  if (!m) return m

  m.id = m.key.id
  m.isGroup = m.key.remoteJid.endsWith("@g.us")
  m.sender = m.key.fromMe
    ? sock.user.id
    : m.key.participant || m.key.remoteJid

  return m
    }
