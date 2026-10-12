// Custom Morgan request-log format.
//
// Morgan's built-in formats log the full request URL, including the query
// string, which can carry sensitive values such as tokens, emails, or search
// terms. This format logs the pathname (req.path) without the query string
// while retaining the method, status, response time, and content length for
// operational debugging.
function requestLogFormat(tokens, req, res) {
  return [
    tokens.method(req, res),
    req.path,
    tokens.status(req, res),
    `${tokens['response-time'](req, res)} ms`,
    '-',
    tokens.res(req, res, 'content-length'),
  ].join(' ');
}

module.exports = requestLogFormat;
