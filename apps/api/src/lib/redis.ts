import { Redis } from "ioredis";
import { logger } from "./logger.js";

let _redis: Redis | null = null;

export function getRedis(url: string): Redis {
  if (!_redis) {
    _redis = new Redis(url, { lazyConnect: false, enableReadyCheck: true });
    _redis.on("error", (err: Error) => logger.error("Redis error", { err }));
    _redis.on("connect", () => logger.info("Redis connected"));
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
