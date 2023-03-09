// https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/
// https://github.com/pinojs/pino
// esmodule import: https://github.com/pinojs/pino/issues/879
import * as pino from 'pino';

/**
 * useful import code:
 * we use `pino-caller` to trace the logger
 * 
 * const logger = require('pino-caller')(require('../../logger'));
 */

// add below type annotation if there is no intellisense
/** @type {import('pino').Logger} */
export default pino({
  level: process.env.PINO_LOG_LEVEL || 'info',
});
