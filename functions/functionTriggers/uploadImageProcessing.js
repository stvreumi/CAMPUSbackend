const path = require("path");
const os = require("os");
const fs = require("fs");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

// require for logger
// https://firebase.google.com/docs/functions/writing-and-viewing-logs
const { logger } = require("firebase-functions");

/**
 * @typedef {import('firebase-functions').storage.ObjectMetadata} ObjectMetadata
 * @typedef {import('firebase-admin')} firebaseAdmin
 * /

/**
 * Convert upload images to jpeg and change its name
 * @param {firebaseAdmin} admin admin instance to communicate with firebase services
 * @param {ObjectMetadata} object the file information of the upload file
 */
async function uploadImageProcessing(admin, object) {
  // get data from upload file
  const {
    bucket: fileBucket, // The Storage bucket that contains the file.
    name: filePath, // File path in the bucket.
    metadata,
    // contentType, // File content type.
    // metageneration, // Number of times metadata has been generated. New objects have a value of 1.
  } = object;

  logger.log(metadata);
  const targetExtensionName = ".jpeg";

  // bucket instance
  const bucket = admin.storage().bucket(fileBucket);

  // generate necessary data
  const fileName = path.basename(filePath);
  const tagId = path.dirname(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);
  const newFileMetadata = {
    contentType: "image/jpeg",
    metadata: {
      tagId,
      // * need to be set so that firebase console can preview the image
      // * must be uuidv4 format
      // https://stackoverflow.com/a/60750194
      firebaseStorageDownloadTokens: uuidv4(),
    },
  };

  // check if the file is already update and convert to jpeg
  if (fileName.endsWith(targetExtensionName)) {
    console.log("already convert to ", targetExtensionName);
    return;
  }

  // upload file reference
  const fileRef = bucket.file(filePath);

  // download to tmp
  await fileRef.download({ destination: tempFilePath });
  logger.log("Image downloaded locally to", tempFilePath);

  // delete it
  await fileRef.delete();

  // ======

  // convert file

  // generate new name
  const newFileName = `${uuidv4()}${targetExtensionName}`;
  const newFilePath = path.join(os.tmpdir(), newFileName);

  // image processing
  /**
   * * The ios system seems to convert HEIF format images to JPEG automatically
   *   when uploading. So we don't need to handle the format conversition on our
   *   own.
   * * https://support.apple.com/en-us/HT207022
   */
  try {
    const image = sharp(tempFilePath);

    /*
    // check metadata
    const { format, orientation } = await image.metadata();
    logger.log(`Original image format: ${format}`);
    logger.log(`Original image orientation: ${orientation}`);
    */

    /**
     * * sharp: "By default all metadata will be removed, which includes
     *   EXIF-based orientation."
     *   https://sharp.pixelplumbing.com/api-output#tofile
     * * Need to preserve the orientation metadata, or the orientation of the
     *   stored image would not meet the expected orientation.
     * * Preserve all available metadata for future use.
     */
    await image.withMetadata().toFile(newFilePath);
  } catch (e) {
    logger.error("sharp image process error:");
    logger.error(e);
    return;
  }

  // upload converted file
  const [uploadFileRef] = await bucket.upload(newFilePath, {
    destination: path.join(tagId, newFileName),
    metadata: newFileMetadata,
  });

  // make this converted file(image) public
  await uploadFileRef.makePublic();

  // delete files
  fs.unlinkSync(tempFilePath);
  fs.unlinkSync(newFilePath);
}

module.exports = uploadImageProcessing;
