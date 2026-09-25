const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns a function that resolves once it's safe to make one more API call,
 * spacing calls so no more than `perSecond` go out in any one-second window.
 * Callers queue on one shared schedule, so overlapping bulk jobs can't combine to exceed the cap.
 */
export function createThrottle(perSecond: number): () => Promise<void> {
    const interval = 1000 / perSecond;
    let lastCall = -Infinity;
    let queue: Promise<void> = Promise.resolve();

    return () => {
        queue = queue.then(async () => {
            // Measure from when the previous call actually went out, so a late timer can't bunch calls up.
            while (Date.now() < lastCall + interval) await sleep(lastCall + interval - Date.now());
            lastCall = Date.now();
        });
        return queue;
    };
}
