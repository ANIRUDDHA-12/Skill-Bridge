module.exports = function (api) {
    api.cache(true);
    return {
        presets: [
            // NativeWind v4: set jsxImportSource to enable className processing
            ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
            'nativewind/babel',
        ],
    };
};
