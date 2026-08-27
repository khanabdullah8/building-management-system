const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function getPagination(query = {}, options = {}) {
  const defaultLimit = options.defaultLimit || DEFAULT_LIMIT;
  const maxLimit = options.maxLimit || MAX_LIMIT;

  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, defaultLimit), maxLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function paginationMeta(page, limit, total) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return { page, limit, total, totalPages };
}

module.exports = { getPagination, paginationMeta, DEFAULT_LIMIT, MAX_LIMIT };
