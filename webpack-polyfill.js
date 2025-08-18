// Polyfill for Promise.withResolvers - must load before webpack-dev-server
// This file is loaded via NODE_OPTIONS in package.json

if (typeof Promise.withResolvers === 'undefined') {
    Promise.withResolvers = function() {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
    console.log('[Node Polyfill] Promise.withResolvers has been polyfilled for Node.js', process.version);
}