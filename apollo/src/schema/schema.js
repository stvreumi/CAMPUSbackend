const { gql } = require('apollo-server');
const { readFileSync } = require('fs');
const path = require('path');

const loadSchemaFromFile = schemaPath =>
  readFileSync(path.join(__dirname, schemaPath)).toString('utf-8');

const typeDefsOfCampus = loadSchemaFromFile('schemaOfCampus.graphql');

const typeDefOfResearch = loadSchemaFromFile('schemaOfResearch.graphql');

const query = loadSchemaFromFile('query.graphql');

const mutation = loadSchemaFromFile('mutation.graphql');

const subscription = loadSchemaFromFile('subscription.graphql');

const mergeSchema = `
  ${typeDefsOfCampus}
  ${typeDefOfResearch}
  ${query}
  ${mutation}
  ${subscription}
`;

const typeDefs = gql`
  ${mergeSchema}
`;

module.exports = typeDefs;
