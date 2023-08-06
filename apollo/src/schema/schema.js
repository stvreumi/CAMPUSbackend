import { gql } from 'apollo-server';
import { readFileSync } from 'fs';
import path from 'path';

// can not use `__dirname` when we move from CommonJS to ES module
// https://nodejs.org/api/esm.html#no-__filename-or-__dirname
const dirname = path.dirname(import.meta.url).replace(/^file:/, '');

const loadSchemaFromFile = schemaPath =>
  readFileSync(path.join(dirname, schemaPath)).toString('utf-8');

const typeDefsOfCampus = loadSchemaFromFile('schemaOfCampus.graphql');

const query = loadSchemaFromFile('query.graphql');

const mutation = loadSchemaFromFile('mutation.graphql');

const subscription = loadSchemaFromFile('subscription.graphql');

const mergeSchema = `
  ${typeDefsOfCampus}
  ${query}
  ${mutation}
  ${subscription}
`;

const typeDefs = gql`
  ${mergeSchema}
`;

export default typeDefs;
