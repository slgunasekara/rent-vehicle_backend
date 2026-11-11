import {v2 as cloudinary} from 'cloudinary';
import '../config/env'; // loads .env first


export const cloudEnabled = !!process.env.CLOUDINARY_URL || !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (cloudEnabled) {

    let cfg = {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    };
    const url = (process.env.CLOUDINARY_URL ?? '').trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (url) cfg = {api_key: url[1], api_secret: url[2], cloud_name: url[3]};
    else if (process.env.CLOUDINARY_URL) console.error('[cloudinary] CLOUDINARY_URL is not in the form cloudinary://<api_key>:<api_secret>@<cloud_name>');
    cloudinary.config({...cfg, secure: true});
}

export const isCloudUrl = (v?: string): boolean => !!v && /^https:\/\/res\.cloudinary\.com\//.test(v);

export const CLOUD_TRANSFORM = 'f_auto,q_auto,w_900';
export const optimised = (url: string): string => (isCloudUrl(url) && !url.includes('/upload/f_auto') ? url.replace('/upload/', `/upload/${CLOUD_TRANSFORM}/`) : url);

export async function uploadImage(dataUrl: string, folder = 'findvehicle/photos'): Promise<string> {
    if (!cloudEnabled || !dataUrl.startsWith('data:image/')) return dataUrl;
    try {
        const r = await cloudinary.uploader.upload(dataUrl, {folder, resource_type: 'image', overwrite: false});
        return r.secure_url;
    } catch (e) {
        console.error('[cloudinary] upload failed, keeping the photo in the database:', (e as Error).message);
        return dataUrl;
    }
}

export async function hostImages(list: string[], folder?: string): Promise<string[]> {
    if (!cloudEnabled) return list;
    const out = [...list];
    for (let i = 0; i < out.length; i += 3) {
        await Promise.all(out.slice(i, i + 3).map(async (v, k) => {
            out[i + k] = await uploadImage(v, folder);
        }));
    }
    return out;
}

export {cloudinary};

const publicIdOf = (url: string): string | null => {
    const m = url.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?([^/]+(?:\/[^/]+)*)\.[a-z0-9]+$/i);
    return m ? m[1] : null;
};

export async function deleteImages(urls: string[]): Promise<void> {
    if (!cloudEnabled) return;
    const ids = urls.filter(isCloudUrl).map(publicIdOf).filter((x): x is string => !!x);
    await Promise.all(ids.map((id) => cloudinary.uploader.destroy(id, {resource_type: 'image'}).catch((e: Error) => console.error('[cloudinary] delete failed:', e.message))));
}
