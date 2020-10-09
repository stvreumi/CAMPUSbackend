const { gql } = require('apollo-server');

const {
  Tag,
  Category,
  Status,
  User,
  Coordinate,
  StreetView,
  Mission,
  Discovery,
  AddNewTagResponse,
  TagUpdateInput,
  AddNewTagDataInput,
  CoordinateInput,
  CategoryInput,
  StreetViewInput,
} = require('./map_schema');

const { Intent, Question } = require('./chatbot_schema');

const Query = `type Query {
  tagRenderList: [Tag]
  tag(id: ID!): Tag
  userAddTagHistory(uid: ID!): [Tag]!
  missionList: [Mission]
  discoveryList: [Discovery]
  intentAnswer(intent: String!): String
}`;

const Mutation = `type Mutation {
  #tagUpdate(data: TagUpdateInput!): TagUpdateResponse!
  #tagImageUrlAdd(id: ID, imageUrl: [String]!): TagDetail!
  addNewTagData(data: AddNewTagDataInput!): AddNewTagResponse
  updateTagStatus(tagId: ID!, statusName: String!): Status!
  addNewIntent(userIntent: String!, userAnswer: String!): String
}`;

const typeDefs = gql(
  [
    Query,
    Tag,
    Category,
    Status,
    User,
    Coordinate,
    StreetView,
    Mission,
    Discovery,
    Intent,
    Question,
    Mutation,
    AddNewTagResponse,
    TagUpdateInput,
    AddNewTagDataInput,
    CoordinateInput,
    CategoryInput,
    StreetViewInput,
  ].join('\n')
);

module.exports = typeDefs;
