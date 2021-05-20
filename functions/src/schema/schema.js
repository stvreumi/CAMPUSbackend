const { gql } = require('apollo-server');
const { readFileSync } = require('fs');
const path = require('path');

const loadSchemaFromFile = schemaPath =>
  readFileSync(path.join(__dirname, schemaPath)).toString('utf-8');

const typeDefsOfCampus = loadSchemaFromFile('schemaOfCampus.graphql');

const query = loadSchemaFromFile('query.graphql');

const mutation = loadSchemaFromFile('mutation.graphql');

const mergeSchema = `
  ${typeDefsOfCampus}
  ${query}
  ${mutation}
`;

const typeDefs = gql`
  ${mergeSchema}
`;

module.exports = typeDefs;
