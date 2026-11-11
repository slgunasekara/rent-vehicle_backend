import path from 'path';
import fs from 'fs';
import {cloudEnabled, cloudinary} from '../services/storage.service';

const OPTIONS = {
    resource_type: 'video' as const,
    public_id: 'hero',
    folder: 'findvehicle',
    overwrite: true,
    invalidate: true
};
const NORMAL_UPLOAD_MAX = 90 * 1024 * 1024; // Cloudinary's normal upload accepts up to 100 MB; bigger files go in chunks

async function run(): Promise<void> {
    if (!cloudEnabled) {
        console.error('Set CLOUDINARY_URL in backend/.env first.');
        process.exit(1);
    }
    const file = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../../../frontend/public/videos/hero.mp4');
    if (!fs.existsSync(file)) {
        console.error('Not found:', file);
        process.exit(1);
    }
    const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
    console.log(`Uploading ${path.basename(file)} (${mb} MB) to Cloudinary...`);

    let url: string | undefined;
    if (fs.statSync(file).size <= NORMAL_UPLOAD_MAX) {
        url = (await cloudinary.uploader.upload(file, OPTIONS)).secure_url;
    } else {
        url = await new Promise<string | undefined>((resolve, reject) => {
            cloudinary.uploader.upload_large(file, {
                ...OPTIONS,
                chunk_size: 6_000_000
            }, (err, res) => (err ? reject(err) : res?.secure_url ? resolve(res.secure_url) : undefined));
        });
    }
    if (!url) throw new Error('Cloudinary did not return a video address - the upload failed.');
    console.log('Hero video uploaded:', url);
}

run().catch((e) => {
    console.error('Upload failed:', e?.message ?? e);
    process.exit(1);
});
