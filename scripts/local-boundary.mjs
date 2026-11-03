export function isLocalRequest(req, port) {
  const peers = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  if (!peers.includes(req.socket.remoteAddress)) return false;
  if (
    Object.keys(req.headers).some(
      (key) => key === "forwarded" || key.startsWith("x-forwarded-"),
    )
  )
    return false;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host))
    return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  // Mutations require an exact same-origin Origin, including requests made by scripts.
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    origin !== `http://${req.headers.host}`
  )
    return false;
  return true;
}
