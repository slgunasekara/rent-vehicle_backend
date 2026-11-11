/**
 * npm run migrate:images
 * Ads posted while Cloudinary was not working keep their photos inside MongoDB (as data URLs).
 * This uploads those photos to Cloudinary and stores the short https URL instead.
 * Safe to run again: photos already on Cloudinary are skipped, and a photo that fails to upload stays where it is.
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Vehicle } from '../models/vehicle.model';
import { cloudEnabled, isCloudUrl, uploadImage } from '../services/storage.service';

(async () => {
  if (!cloudEnabled) { console.error('Set CLOUDINARY_URL in backend/.env first.'); process.exit(1); }
  await connectDB();
  const ads = await Vehicle.find({}).select('+images');
  let movedPhotos = 0, failedPhotos = 0, changedAds = 0;
  for (const ad of ads) {
    if (!ad.images.some((i) => !isCloudUrl(i))) continue;
    const next: string[] = [];
    for (const img of ad.images) {
      if (isCloudUrl(img) || !img.startsWith('data:image/')) { next.push(img); continue; }
      const url = await uploadImage(img, 'findvehicle/ads'); // returns the data URL itself when the upload fails
      if (isCloudUrl(url)) movedPhotos += 1; else failedPhotos += 1;
      next.push(url);
    }
    ad.images = next;
    ad.imageCount = next.length;
    await ad.save(); // the model keeps `cover` in step with the first photo
    changedAds += 1;
    console.log(`ad ${ad.id}: ${next.filter(isCloudUrl).length}/${next.length} photos on Cloudinary`);
  }
  console.log(`Done. Ads updated: ${changedAds}, photos moved: ${movedPhotos}, photos that failed: ${failedPhotos}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
