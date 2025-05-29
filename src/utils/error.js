/**
 * Creates a custom error object with status code
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {Error} [originalError] - Original error object if any
 * @returns {Error} Custom error object
 */
function createError(message, status, originalError = null) {
  const error = new Error(message);
  error.status = status;
  if (originalError) {
    error.originalError = originalError;
  }
  return error;
}

module.exports = {
  createError
}; 