// Polyfill for Promise.withResolvers - needed for browser compatibility
// PDF.js requires this API which is not yet available in all browsers

interface PromiseWithResolvers<T> {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
}

declare global {
    interface PromiseConstructor {
        withResolvers<T>(): PromiseWithResolvers<T>;
    }
}

// Apply polyfill for browser environment
if (typeof Promise.withResolvers === 'undefined') {
    Promise.withResolvers = function <T>(): PromiseWithResolvers<T> {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: any) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
    console.log('[Browser Polyfill] Promise.withResolvers has been polyfilled for browser environment');
}

export {};