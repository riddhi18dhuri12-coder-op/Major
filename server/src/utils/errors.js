class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const bad = (m, d) => new HttpError(400, m, d);
const unauthorized = (m = "Unauthorized") => new HttpError(401, m);
const forbidden = (m = "Forbidden") => new HttpError(403, m);
const notFound = (m = "Not found") => new HttpError(404, m);
const conflict = (m) => new HttpError(409, m);

module.exports = { HttpError, bad, unauthorized, forbidden, notFound, conflict };
