// Discord-IPC-Protokoll: [int32 LE Opcode][int32 LE Länge][JSON]

export const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const

export function encodeFrame(op: number, data: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(data), 'utf8')
  const head = Buffer.alloc(8)
  head.writeInt32LE(op, 0)
  head.writeInt32LE(json.length, 4)
  return Buffer.concat([head, json])
}

export function decodeFrames(buf: Buffer): { frames: { op: number; data: any }[]; rest: Buffer } {
  const frames: { op: number; data: any }[] = []
  let off = 0
  while (buf.length - off >= 8) {
    const op = buf.readInt32LE(off)
    const len = buf.readInt32LE(off + 4)
    if (buf.length - off - 8 < len) break
    const raw = buf.subarray(off + 8, off + 8 + len).toString('utf8')
    let data: unknown = null
    try {
      data = JSON.parse(raw)
    } catch {
      /* kaputter Frame wird übersprungen */
    }
    frames.push({ op, data })
    off += 8 + len
  }
  return { frames, rest: buf.subarray(off) }
}

export function pipeNames(): string[] {
  return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`)
}
