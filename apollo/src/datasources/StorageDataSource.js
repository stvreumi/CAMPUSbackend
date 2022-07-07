/** @module StorageDataSource */
const { DataSource } = require('apollo-datasource');
/** @type {import('pino').Logger} */
const logger = require('pino-caller')(require('../../logger'));

// firebaseUtil
const { generateFileName } = require('./firebaseUtils');

// used for type annotation
/**
 * @typedef {import('@google-cloud/storage').Bucket} Bucket
 */

//@ts-check
class StorageDataSource extends DataSource {
  /**
   * Use admin to construct necessary entity of communication
   * @param {Bucket} bucket
   */
  constructor(bucket) {
    super();

    // for storage bucket
    this.bucket = bucket;
  }

  /**
   * This is a function that gets called by ApolloServer when being setup.
   * This function gets called with the datasource config including things
   * like caches and context. We'll assign this.context to the request context
   * here, so we can know about the user making requests
   */
  initialize(config) {
    this.context = config.context;
  }

  /**
   * Get image urls of specific tag
   * @param {object} param
   * @param {string} param.tagId the ID of the tag
   * @returns {Promise<string>[]} the image links of the current tag
   */
  async getImageUrls({ tagId }) {
    // https://github.com/googleapis/nodejs-storage/blob/main/samples/listFilesByPrefix.js#L44
    const options = {
      delimiter: '/',
      prefix: tagId,
    };
    logger.info(options);
    const [files] = await this.bucket.getFiles(options);

    return files.map(file => file.metadata.mediaLink);
  }

  /**
   *
   * @param {object} param
   * @param {string} param.docPath
   * @returns
   */
  async getFixedTagSubLocationImageUrls({ docPath }) {
    logger.info(docPath);
    // https://github.com/googleapis/nodejs-storage/blob/main/samples/listFilesByPrefix.js#L44
    // use delimiter to only get the files in the directory, not in the subdirectory
    const options = {
      delimiter: '/',
      prefix: docPath,
    };
    const [files] = await this.bucket.getFiles(options);

    return files.map(file => file.metadata.mediaLink);
  }

  /**
   * Generate Signed URL to let front end upload images in a tag to firebase storage
   * The file name on the storage will looks like: `tagID/(8 digits uuid)`
   * reference from: https://github.com/googleapis/nodejs-storage/blob/master/samples/generateV4UploadSignedUrl.js
   *
   * The Signed URL is a temporary URL used for uploading image from user. The uploaded image
   * would have a new name and another permenent URL for downloading.
   * @param {object} param
   * @param {number} param.imageUploadNumber
   * @param {string} param.firestorePath
   * @returns {Promise<string>[]} an array contain singed urls with length `imageNumber`
   */
  getImageUploadUrls({ imageUploadNumber, firestorePath }) {
    if (imageUploadNumber > 0) {
      // These options will allow temporary uploading of the file with outgoing
      // Content-Type: application/octet-stream header.
      const options = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
        contentType: 'application/octet-stream',
      };

      const fileNameArray = generateFileName(imageUploadNumber, firestorePath);

      // for local test only
      // return fileNameArray;

      return fileNameArray.map(async name => {
        const [url] = await this.bucket.file(name).getSignedUrl(options);
        return url;
      });
    }
    return [];
  }

  /**
   * image management function definition
   * @param {string} tagId
   * @param {string[]} imageDeleteUrls
   * @returns
   */
  async doImageDelete(tagId, imageDeleteUrls) {
    if (imageDeleteUrls) {
      const locations = imageDeleteUrls.map(url => {
        const re = /\/([\w]+)%2F([\w\-]+.jpg)/i;
        const reMatchResult = url.match(re);
        const [_, tagIdInUrl, fileNameInUrl] = reMatchResult;
        if (tagIdInUrl !== tagId) {
          throw new Error('The image you want to delete is not in this tag');
        }
        return `${tagIdInUrl}/${fileNameInUrl}`;
      });

      // delete files
      // usign Promise.allSettled to ensure all promises would be called
      const responses = await Promise.allSettled(
        locations.map(async fileLocation =>
          this.bucket.file(fileLocation).delete()
        )
      );
      const rejectedMessages = responses.filter(
        ({ status }) => status === 'rejected'
      );
      if (rejectedMessages.length > 0) {
        console.error(rejectedMessages);
        throw new Error(
          `${rejectedMessages.length} files didn't be deleted successfully`
        );
      }
      return true;
    }
    return null;
  }
} // class StorageDataSource

module.exports = StorageDataSource;
