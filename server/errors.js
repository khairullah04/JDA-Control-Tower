// Whatever falls through a route still answers in the API's own shape: { error }. Without this, a
// body that was too large or was not JSON came back as an HTML page, which the pages could only
// report as "Unexpected token <".
export function apiErrors(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.type === 'entity.too.large' ? 'That is too large to send (25 MB at most).'
    : err.type === 'entity.parse.failed' ? 'That request could not be read.' : status >= 500 ? 'The server hit a problem with that request.' : err.message });
}
export const apiNotFound = (req, res) => res.status(404).json({ error: 'There is nothing at that address.' });
