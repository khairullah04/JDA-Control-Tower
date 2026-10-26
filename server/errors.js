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

// An error whose message is written for the person using the page ("Drive is not configured…"), so it
// may be shown as it is. Any other error (from a library: Google, the AI service, the file system) can
// carry file paths, keys or request ids, so the page gets a plain message and the details go to the log.
export const userError = (message, status) => Object.assign(new Error(message), { expose: true, ...(status && { status }) });
export function publicMessage(e, fallback = 'The server hit a problem with that request. Try again, or tell the administrator.') {
  const fromAService = e && ('headers' in e || 'response' in e || 'requestID' in e || 'config' in e); // an outside service's own error (AI, Google)
  if (e?.expose || (!fromAService && e?.status && e.status < 500)) return e.message;
  console.error(e);
  return fallback;
}
