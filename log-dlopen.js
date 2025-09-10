const orig = process.dlopen;
process.dlopen = function (mod, filename) {
    console.error('[dlopen]', filename);
    return orig.apply(this, arguments);
};
