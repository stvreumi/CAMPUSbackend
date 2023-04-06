/** @module src/index */
import { apolloServerGenerator } from './apolloServerGenerator.js';

const apolloServer = apolloServerGenerator({ test: false });

export default apolloServer;
