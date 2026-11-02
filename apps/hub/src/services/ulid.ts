import crypto from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;

export function generateUlid(seedTime: number = Date.now()): string {
  // 10 chars time
  let timeStr = '';
  let time = seedTime;
  for (let i = 9; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    timeStr = ENCODING.charAt(mod) + timeStr;
    time = (time - mod) / ENCODING_LEN;
  }

  // 16 chars random
  const randomBytes = crypto.randomBytes(10);
  let randStr = '';
  for (let i = 0; i < 16; i++) {
    const byteIndex = Math.floor((i * 10) / 16);
    const randCharIndex = (randomBytes[byteIndex] + i * 17) % ENCODING_LEN;
    randStr += ENCODING.charAt(randCharIndex);
  }

  return timeStr + randStr;
}
