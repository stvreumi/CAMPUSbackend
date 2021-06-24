const { gql } = require('apollo-server');
const { readFileSync } = require('fs');
const path = require('path');

const loadSchemaFromFile = schemaPath =>
  readFileSync(path.join(__dirname, schemaPath)).toString('utf-8');

const subscription = loadSchemaFromFile('subscription.graphql');

const typeDefs = gql`
  ${subscription}
`;

module.exports = typeDefs;
