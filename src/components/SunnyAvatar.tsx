// A plain <img>, not next/image: next/image's on-demand /_next/image
// endpoint needs the server even for an already-local file, which would
// undo the point of the service worker precaching this for offline use
// (see the /sunny.png entry in public/sw.js's PRECACHE_ASSETS).
export function SunnyAvatar({ size = 56 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/sunny.png" alt="Sunny" width={size} height={size} style={{ width: size, height: size }} />;
}
