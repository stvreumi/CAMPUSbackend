// schema definition about map

// Query

const Tag = `type Tag {
  id: ID!
  locationName: String
  accessibility: Float
  category: Category
  floor: Int
  coordinates: Coordinate
  createTime: String
  lastUpdateTime: String
  createUser: User
  description: String
  imageUrl: [String]
  streetViewInfo: StreetView
  status: Status
  statusHistory: [Status]!
}`;

const Category = `type Category {
  missionName: String!
  subTypeName: String
  targetName: String
}`;

const Status = `type Status {
  statusName: String!
  createTime: String!
  createUser: User
  description: String
  "Only available in 問題任務, otherwise null"
  numberOfUpVote: Int
  """
  Only available in 問題任務, otherwise null. 
  In the \`statusHistory\` this field would also be null
  """
  hasUpVote: Boolean
}`;

const User = `type User {
  uid: ID!
  displayName: String
  "only available to user itself?need authorization mechanism"
  email: String
}`;

const Coordinate = `type Coordinate {
  latitude: String!
  longitude: String!
}`;

const StreetView = `type StreetView {
  povHeading: Float!
  povPitch: Float!
  panoID: String!
  cameraLatitude: Float!
  cameraLongitude: Float!
}`;

const Mission = `type Mission {
  id: ID!
  name: String
  discoveries: [Discovery]
}`;

const Discovery = `type Discovery {
  id: ID!
  mission: Mission
  name: String
}`;

// mutation
const updateUpVoteAction = `enum updateUpVoteAction {
  UPVOTE
  CANCEL_UPVOTE
}`;

const updateUpVoteResponse = `type updateUpVoteResponse {
  tagId: String!
  numberOfUpVote: Int
  hasUpVote: Boolean
}`;

const AddNewTagResponse = `type AddNewTagResponse {
  tag: Tag!
  imageNumber: Int!
  imageUploadUrl: [String]!
}`;

const AddTagDataInput = `input addTagDataInput {
  locationName: String!
  category: CategoryInput!
  coordinates: CoordinateInput!
  description: String
  imageNumber: Int
  floor: Int
  streetViewInfo: StreetViewInput
}`;

const UpdateTagDataInput = `input updateTagDataInput {
  locationName: String
  category: CategoryInput
  coordinates: CoordinateInput
  description: String
  imageNumber: Int
  floor: Int
  streetViewInfo: StreetViewInput
}`;

const CoordinateInput = `input CoordinateInput {
  latitude: String
  longitude: String
}`;

const CategoryInput = `input CategoryInput {
  "設施任務/問題任務/動態任務"
  missionName: String!
  "**類型"
  subTypeName: String
  "具體**"
  targetName: String
}`;

const StreetViewInput = `input StreetViewInput {
  povHeading: Float!
  povPitch: Float!
  panoID: String!
  cameraLatitude: Float!
  cameraLongitude: Float!
}`;

module.exports = {
  Tag,
  Category,
  Status,
  User,
  Coordinate,
  StreetView,
  Mission,
  Discovery,
  updateUpVoteAction,
  updateUpVoteResponse,
  AddNewTagResponse,
  AddTagDataInput,
  UpdateTagDataInput,
  CoordinateInput,
  CategoryInput,
  StreetViewInput,
};
