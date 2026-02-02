/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Optional native deps of `ws` that cause build-time resolution errors in Next.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      bufferutil: false,
      'utf-8-validate': false,
    };

    // Ignore Windows system files that break watchpack initial scan.
    const systemIgnored = /[\\/]?(DumpStack\.log\.tmp|hiberfil\.sys|pagefile\.sys|swapfile\.sys)$/i;
    const existing = config.watchOptions?.ignored;

    let nextIgnored;
    if (existing instanceof RegExp) {
      // Merge regex into one (schema allows single RegExp)
      const flags = Array.from(new Set((existing.flags + 'i').split(''))).join('');
      nextIgnored = new RegExp(`${existing.source}|${systemIgnored.source}`, flags);
    } else if (Array.isArray(existing)) {
      // Schema allows array of strings only
      const existingStrings = existing.filter((v) => typeof v === 'string' && v.length > 0);
      nextIgnored = [
        ...existingStrings,
        '**/DumpStack.log.tmp',
        '**/hiberfil.sys',
        '**/pagefile.sys',
        '**/swapfile.sys',
      ];
    } else if (typeof existing === 'string' && existing.length > 0) {
      nextIgnored = [
        existing,
        '**/DumpStack.log.tmp',
        '**/hiberfil.sys',
        '**/pagefile.sys',
        '**/swapfile.sys',
      ];
    } else {
      nextIgnored = [
        '**/DumpStack.log.tmp',
        '**/hiberfil.sys',
        '**/pagefile.sys',
        '**/swapfile.sys',
      ];
    }

    config.watchOptions = {
      ...config.watchOptions,
      ignored: nextIgnored,
    };

    return config;
  },
};

module.exports = nextConfig;
