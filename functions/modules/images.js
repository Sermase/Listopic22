const functions = require('firebase-functions');
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sharp = require('sharp');

// Ensure admin is initialized in index.js, or check here if needed. 
// Usually admin is initialized in top-level index.js.

exports.onImageUpload = functions.storage.object().onFinalize(async (object) => {
    const fileBucket = object.bucket;
    const filePath = object.name;
    const contentType = object.contentType;

    // Exit if this is triggered on a file that is not an image.
    if (!contentType.startsWith('image/')) {
        console.log('This is not an image.');
        return null;
    }

    // Get the file name.
    const fileName = path.basename(filePath);

    // Exit if the image is already a thumbnail.
    if (fileName.includes('_thumb_')) {
        console.log('Already a thumbnail.');
        return null;
    }

    // Sizes to generate
    // const sizes = [200, 500]; 
    // For now, let's stick to one good versatile size to save storage/computations
    const THUMB_SIZE = 500;
    const thumbFileName = `${path.parse(fileName).name}_thumb_${THUMB_SIZE}${path.parse(fileName).ext}`;
    const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);

    const bucket = admin.storage().bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    const tempThumbPath = path.join(os.tmpdir(), thumbFileName);

    try {
        // 1. Download file
        await bucket.file(filePath).download({ destination: tempFilePath });
        console.log('Image downloaded locally to', tempFilePath);

        // 2. Resize
        await sharp(tempFilePath)
            .resize({ w: THUMB_SIZE, h: THUMB_SIZE, fit: 'inside' }) // 'inside' preserves aspect ratio
            .toFile(tempThumbPath);
        console.log('Thumbnail created at', tempThumbPath);

        // 3. Upload thumbnail
        await bucket.upload(tempThumbPath, {
            destination: thumbFilePath,
            metadata: {
                contentType: contentType,
                metadata: {
                    firebaseStorageDownloadTokens: object.metadata?.firebaseStorageDownloadTokens, // Optional: might need new token
                }
            },
        });
        console.log('Thumbnail uploaded to Storage at', thumbFilePath);

        // 4. Cleanup temp files
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(tempThumbPath);

        return console.log('Thumbnail generation complete.');

    } catch (error) {
        console.error('Error processing image:', error);
        // Try to cleanup even on error
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
        return null;
    }
});
