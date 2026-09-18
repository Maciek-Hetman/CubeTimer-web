// Minimal AES-128 block cipher (ECB, single 16-byte blocks). Web Crypto has no
// ECB mode, and the QiYi timer protocol encrypts each 16-byte block on its own.

const SBOX = new Uint8Array(256)
const INV_SBOX = new Uint8Array(256)

function xtime(a: number): number {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff
}

function mul(a: number, b: number): number {
  let result = 0
  while (b) {
    if (b & 1) {
      result ^= a
    }
    a = xtime(a)
    b >>= 1
  }
  return result
}

function rotl8(x: number, shift: number): number {
  return ((x << shift) | (x >> (8 - shift))) & 0xff
}

;(function buildSbox() {
  let p = 1
  let q = 1
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0)
    q ^= q << 1
    q ^= q << 2
    q ^= q << 4
    q &= 0xff
    if (q & 0x80) {
      q ^= 0x09
    }
    SBOX[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff
  } while (p !== 1)
  SBOX[0] = 0x63
  for (let i = 0; i < 256; i++) {
    INV_SBOX[SBOX[i]] = i
  }
})()

function expandKey(key: ArrayLike<number>): Uint8Array {
  if (key.length !== 16) {
    throw new Error('AES-128 key must be 16 bytes')
  }
  const w = new Uint8Array(176)
  w.set(Array.from(key))
  let rcon = 1
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4]
    let t1 = w[i - 3]
    let t2 = w[i - 2]
    let t3 = w[i - 1]
    if (i % 16 === 0) {
      const first = t0
      t0 = SBOX[t1] ^ rcon
      t1 = SBOX[t2]
      t2 = SBOX[t3]
      t3 = SBOX[first]
      rcon = xtime(rcon)
    }
    w[i] = w[i - 16] ^ t0
    w[i + 1] = w[i - 15] ^ t1
    w[i + 2] = w[i - 14] ^ t2
    w[i + 3] = w[i - 13] ^ t3
  }
  return w
}

function addRoundKey(s: Uint8Array, w: Uint8Array, round: number): void {
  const offset = round * 16
  for (let i = 0; i < 16; i++) {
    s[i] ^= w[offset + i]
  }
}

function shiftRows(s: Uint8Array, inverse: boolean): void {
  const copy = s.slice()
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const from = inverse ? (c - r + 4) % 4 : (c + r) % 4
      s[r + 4 * c] = copy[r + 4 * from]
    }
  }
}

function mixColumns(s: Uint8Array, inverse: boolean): void {
  const [m0, m1, m2, m3] = inverse ? [14, 11, 13, 9] : [2, 3, 1, 1]
  for (let c = 0; c < 16; c += 4) {
    const a0 = s[c]
    const a1 = s[c + 1]
    const a2 = s[c + 2]
    const a3 = s[c + 3]
    s[c] = mul(a0, m0) ^ mul(a1, m1) ^ mul(a2, m2) ^ mul(a3, m3)
    s[c + 1] = mul(a0, m3) ^ mul(a1, m0) ^ mul(a2, m1) ^ mul(a3, m2)
    s[c + 2] = mul(a0, m2) ^ mul(a1, m3) ^ mul(a2, m0) ^ mul(a3, m1)
    s[c + 3] = mul(a0, m1) ^ mul(a1, m2) ^ mul(a2, m3) ^ mul(a3, m0)
  }
}

export interface Aes128 {
  encryptBlock(block: ArrayLike<number>): number[]
  decryptBlock(block: ArrayLike<number>): number[]
}

export function createAes128(key: ArrayLike<number>): Aes128 {
  const w = expandKey(key)

  function toState(block: ArrayLike<number>): Uint8Array {
    if (block.length !== 16) {
      throw new Error('AES block must be 16 bytes')
    }
    return Uint8Array.from(Array.from(block))
  }

  return {
    encryptBlock(block) {
      const s = toState(block)
      addRoundKey(s, w, 0)
      for (let round = 1; round < 10; round++) {
        s.forEach((b, i) => (s[i] = SBOX[b]))
        shiftRows(s, false)
        mixColumns(s, false)
        addRoundKey(s, w, round)
      }
      s.forEach((b, i) => (s[i] = SBOX[b]))
      shiftRows(s, false)
      addRoundKey(s, w, 10)
      return Array.from(s)
    },
    decryptBlock(block) {
      const s = toState(block)
      addRoundKey(s, w, 10)
      for (let round = 9; round > 0; round--) {
        shiftRows(s, true)
        s.forEach((b, i) => (s[i] = INV_SBOX[b]))
        addRoundKey(s, w, round)
        mixColumns(s, true)
      }
      shiftRows(s, true)
      s.forEach((b, i) => (s[i] = INV_SBOX[b]))
      addRoundKey(s, w, 0)
      return Array.from(s)
    },
  }
}
