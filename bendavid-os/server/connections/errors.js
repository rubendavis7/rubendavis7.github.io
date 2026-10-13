'use strict';

class ConnectionError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.status = 503;
  }
}

module.exports = { ConnectionError };
