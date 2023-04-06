/** @module src/index */
import { apolloServerGenerator } from '../apolloServerGenerator.js';

const apolloTestServer = apolloServerGenerator({ test: true });

export default apolloTestServer;
