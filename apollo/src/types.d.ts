import { firestore } from 'firebase-admin';
/** dataSources */
import TagDataSource from './datasources/TagDataSource';
import StorageDataSource from './datasources/StorageDataSource';
import AuthDataSource from './datasources/AuthDataSource';
import UserDataSource from './datasources/UserDataSource';

interface User {
  logIn: boolean;
  uid: string;
  email: string;
  displayName: string;
}

interface Category {
  missionName: string;
  subTypeName?: string;
  targetName?: string;
}

interface Coordinate {
  latitude: string;
  longitude: string;
}

export interface Status {
  statusName: string;
  createTime: string;
  createUser?: User;
  description?: string;
  numberOfUpVote?: number;
  hasUpVote?: Boolean;
}

export interface RawStatusDocumentFields extends Status {
  createTime: firestore.Timestamp;
}

export interface StatusWithDocumentReference extends Status {
  statusDocRef: firestore.DocumentReference;
}

export interface Tag extends RawTagDocumentFields {
  coordinates: Coordinate;
  createTime: string;
  lastUpdateTime: string;
  imageUrl: Array<string>;
  status: Status;
  statusHistory: Array<Status>;
  viewCount: number;
}

export interface RawTagDocumentFields {
  id: string;
  locationName: string;
  category: Category;
  floor: number;
  coordinates: firestore.GeoPoint;
  createTime: firestore.Timestamp;
  lastUpdateTime: firestore.Timestamp;
  createUser: User;
  streetViewInfo: StreetView;
  geohash: string;
}

export interface AddorUpdateTagResponse {
  tag: Tag;
  imageUploadNumber: number;
  imageUploadUrls: string[];
  imageDeleteStatus: boolean;
}

interface TagDataInput {
  locationName?: string;
  category?: Category;
  coordinates?: Coordinate;
  imageUploadNumber?: number;
  floor?: number;
  streetViewInfo?: StreetView;
  statusName?: string;
}

export interface AddNewTagDataInput extends TagDataInput {
  description?: string;
}

export interface UpdateTagDataInput extends TagDataInput{
  imageDeleteUrls?: String[];
}

export interface Page {
  cursor: string;
  empty: boolean;
}

export interface DataPage {
  data: object[];
}
export interface TagPage extends Page {
  Tags: Tag[];
}

export interface StatusPage extends Page {
  statusList: Status[];
}

export interface PageParams {
  pageSize: number;
  cursor: string;
}

export interface Coordinate {
  latitude: string;
  longitude: string;
}

export interface StreetView {
  povHeading: number;
  povPitch: number;
  panoID: string;
  cameraLatitude: number;
  cameraLongitude: number;
}

export interface DecodedUserInfoFromAuthHeader {
  logIn: boolean;
  uid: string;
}

interface DataSources {
  tagDataSource: TagDataSource;
  storageDataSource: StorageDataSource;
  authDataSource: AuthDataSource;
  userDataSource: UserDataSource;
}

interface RawUserDocumentFields {
  hasReadGuide?: boolean;
}

export interface ResolverArgsInfo {
  dataSources: DataSources;
  userInfo: DecodedUserInfoFromAuthHeader;
}
