import crypto from "crypto";

type PowChallenge = {
  challenge: string;
  difficulty: number;
  expiresAt: number;
  used: boolean;
};

const DEFAULT_TTL_MS = 30_000;
const store = new Map<string, PowChallenge>();

function cleanupExpiredChallenges(now = Date.now()): void {
  for (const [challenge, record] of Array.from(store.entries())) {
    if (record.expiresAt <= now || record.used) {
      store.delete(challenge);
    }
  }
}

export function createPowChallenge(
  difficulty: number,
  ttlMs = DEFAULT_TTL_MS,
): PowChallenge {
  cleanupExpiredChallenges();

  const challenge = crypto.randomBytes(16).toString("hex");
  const record: PowChallenge = {
    challenge,
    difficulty,
    expiresAt: Date.now() + ttlMs,
    used: false,
  };

  store.set(challenge, record);
  return record;
}

export function consumePowChallenge(challenge: string): PowChallenge | null {
  cleanupExpiredChallenges();
  const record = store.get(challenge);

  if (!record || record.used || record.expiresAt <= Date.now()) {
    return null;
  }

  record.used = true;
  store.set(challenge, record);
  return record;
}
