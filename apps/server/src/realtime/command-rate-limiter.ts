type Bucket = {
	tokens: number;
	lastRefillAt: number;
};

export class CommandRateLimiter {
	private readonly buckets = new Map<string, Bucket>();
	private readonly capacity = 10;
	private readonly refillPerSecond = 2;
	private lastCleanupAt = 0;

	constructor(private readonly now: () => number = () => performance.now()) {}

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
