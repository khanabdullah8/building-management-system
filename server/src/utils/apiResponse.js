function sendSuccess(res, data, message, meta, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    ...(message ? { message } : {}),
    ...(data !== undefined ? { data } : {}),
    ...(meta ? { meta } : {}),
  });
}

module.exports = { sendSuccess };
