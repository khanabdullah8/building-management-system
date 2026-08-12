class ApiError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    if (errors !== undefined) {
      this.errors = errors;
    }
  }
}

module.exports = ApiError;
