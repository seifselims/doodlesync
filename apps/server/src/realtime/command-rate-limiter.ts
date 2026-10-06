type Bucket = {
	tokens: number;
	lastRefillAt: number;
};

type RateLimitOptions = {
	capacity?: number;
	refillPerSecond?: number;
};

export class CommandRateLimiter {
	private readonly buckets = new Map<string, Bucket>();
	private readonly capacity: number;
	private readonly refillPerSecond: number;
	private lastCleanupAt = 0;

	constructor(
		private readonly now: () => number = () => performance.now(),
		{ capacity = 10, refillPerSecond = 2 }: RateLimitOptions = {},
	) {
		this.capacity = capacity;
		this.refillPerSecond = refillPerSecond;
	}

	allow(playerId: string): boolean {
		const now = this.now();

		// An idle bucket has fully refilled long before it is removed.
		if (now - this.lastCleanupAt >= 60_000) {
			for (const [id, bucket] of this.buckets) {
				if (now - bucket.lastRefillAt >= 60_000) {
					this.buckets.delete(id);
				}
			}
			this.lastCleanupAt = now;
		}

		let bucket = this.buckets.get(playerId);
		if (!bucket) {
			bucket = { tokens: this.capacity, lastRefillAt: now };
			this.buckets.set(playerId, bucket);
		}

		const elapsedSeconds = (now - bucket.lastRefillAt) / 1000;
		bucket.tokens = Math.min(
			this.capacity,
			bucket.tokens + elapsedSeconds * this.refillPerSecond,
		);
		bucket.lastRefillAt = now;

		if (bucket.tokens < 1) return false;
		bucket.tokens -= 1;
		return true;
	}
}
