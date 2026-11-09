import { v2 as cloudinary } from 'cloudinary';
import '../config/env'; // loads .env first

/**
 * Photos live on Cloudinary (free CDN) instead of inside MongoDB. The owner's phone/browser still sends a compressed data URL;
 * we upload it here and keep only the short https URL in the database, so lists load fast and the images come straight from the CDN.
 *
 * Set  CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud_name>  in backend/.env.
 * If it is missing (or an upload fails) the data URL is stored as before, so nothing ever breaks.
 */
export const cloudEnabled = !!process.env.CLOUDINARY_URL || !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (cloudEnabled) {
  // the cloudinary package reads CLOUDINARY_URL when it is first imported - before dotenv has loaded .env - so the settings
  // are given to it explicitly here (otherwise every upload fails and photos silently stay in the database)
  let cfg = { cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET };
  const url = (process.env.CLOUDINARY_URL ?? '').trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (url) cfg = { api_key: url[1], api_secret: url[2], cloud_name: url[3] };
  else if (process.env.CLOUDINARY_URL) console.error('[cloudinary] CLOUDINARY_URL is not in the form cloudinary://<api_key>:<api_secret>@<cloud_name>');
  cloudinary.config({ ...cfg, secure: true });
}

export const isCloudUrl = (v?: string): boolean => !!v && /^https:\/\/res\.cloudinary\.com\//.test(v);

/** ONE delivery size for every use (cards, gallery, detail) - f_auto = WebP/AVIF automatically, q_auto = smart quality. One transformation = one cached copy = low free-plan usage. */
export const CLOUD_TRANSFORM = 'f_auto,q_auto,w_900';
export const optimised = (url: string): string => (isCloudUrl(url) && !url.includes('/upload/f_auto') ? url.replace('/upload/', `/upload/${CLOUD_TRANSFORM}/`) : url);

/** upload one data URL; returns the https URL (or the data URL itself when Cloudinary is off / fails) */
export async function uploadImage(dataUrl: string, folder = 'findvehicle/photos'): Promise<string> {
  if (!cloudEnabled || !dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const r = await cloudinary.uploader.upload(dataUrl, { folder, resource_type: 'image', overwrite: false });
    return r.secure_url;
  } catch (e) {
    console.error('[cloudinary] upload failed, keeping the photo in the database:', (e as Error).message);
    return dataUrl;
  }
}

/** upload a list: photos that are already URLs are kept as they are; new data URLs are uploaded (3 at a time) */
export async function hostImages(list: string[], folder?: string): Promise<string[]> {
  if (!cloudEnabled) return list;
  const out = [...list];
  for (let i = 0; i < out.length; i += 3) {
    await Promise.all(out.slice(i, i + 3).map(async (v, k) => { out[i + k] = await uploadImage(v, folder); }));
  }
  return out;
}

export { cloudinary };

/** the Cloudinary public id inside a delivery URL (".../upload/v123/folder/name.jpg" -> "folder/name") */
const publicIdOf = (url: string): string | null => {
  const m = url.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?([^/]+(?:\/[^/]+)*)\.[a-z0-9]+$/i);
  return m ? m[1] : null;
};

/** remove photos from Cloudinary (an ad was deleted / expired) so the free storage never fills up. Never throws. */
export async function deleteImages(urls: string[]): Promise<void> {
  if (!cloudEnabled) return;
  const ids = urls.filter(isCloudUrl).map(publicIdOf).filter((x): x is string => !!x);
  await Promise.all(ids.map((id) => cloudinary.uploader.destroy(id, { resource_type: 'image' }).catch((e: Error) => console.error('[cloudinary] delete failed:', e.message))));
}
