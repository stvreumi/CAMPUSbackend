import { firestore } from 'firebase-admin';
import FirebaseAPI from './datasources/firebase';

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

export interface StatusWithDocumentReference extends Status {
  statusDocRef: firestore.DocumentReference;
}

export interface Tag {
  id: string;
  locationName: string;
  accessibility: number;
  category: Category;
  floor: number;
  coordinates: Coordinate;
  createTime: string;
  lastUpdateTime: string;
  createUser: object;
  description: string;
  imageUrl: Array<string>;
  streetViewInfo: StreetView;
  status: object;
  statusHistory: Array<object>;
}

export interface RawTagFromFirestore {
  id: string;
  locationName: string;
  accessibility: number;
  category: object;
  floor: number;
  coordinates: object;
  createTime: firestore.Timestamp;
  lastUpdateTime: firestore.Timestamp;
  createUser: object;
  streetViewInfo: StreetView;
}

export interface AddorUpdateTagResponse {
  tag: Tag;
  imageUploadNumber: number;
  imageUploadUrls: string[];
  imageDeleteStatus: boolean;
}

export interface AddTagDataInput {
  locationName: string;
  category: Category;
  coordinates: Coordinate;
  description?: string;
  imageUploadNumber: number;
  floor?: number;
  streetViewInfo?: StreetView;
}

export interface UpdateTagDataInput {
  locationName?: string
  category?: Category
  coordinates?: Coordinate
  floor?: number
  streetViewInfo?: StreetView
  imageDeleteUrls?: String[]
  imageUploadNumber?: number
}

export interface Category {
  missionName: string;
  subTypeName: string;
  targetName: string;
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

interface Datasources {
  firebaseAPI: FirebaseAPI;
}

export interface ResolverArgsInfo {
  dataSources: Datasources;
  userInfo: DecodedUserInfoFromAuthHeader;
}
