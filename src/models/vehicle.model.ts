import { Schema, model, Document, Types } from 'mongoose';
import { isCloudUrl } from '../services/storage.service';
import { CATEGORY_KEYS, FUEL_KEYS, DRIVER_KEYS, CONDITION_KEYS, PRICE_TYPE_KEYS, Category, Fuel, DriverOpt, Condition, PriceType } from '../data/vehicleOptions';

export interface IVehicle extends Document {
  owner: Types.ObjectId;
  category: Category;
  make: string;
  vehicleModel: string;
  year?: number;
  fuel: Fuel;
  driver: DriverOpt;
  condition: Condition;
  seats?: number;
  kmPerLitre?: number; // fuel economy: km on 1 litre (optional, not for electric vehicles)
  district: string;
  city: string;
  priceType: PriceType;
  pricePerKm?: number;
  pricePerDay?: number;
  pricePerMonth?: number;
  contactNumber: string;
  description?: string;
  images: string[]; // Cloudinary URLs (or compressed data URLs when Cloudinary is switched off) - never sent in lists
  imageCount: number;
  views: number; // how many different visitors opened the ad page
  callClicks: number; // how many times the Call / WhatsApp buttons were used
  featuredUntil?: Date; // paid "Top ad": shown first with a badge until this date
  suspended?: boolean; // the owner's account is banned: the ad is hidden
  insuranceMailed: boolean; // the "insurance expired, ad hidden" e-mail was sent
  ratingAvg: number; // average of the users' stars (0 = not rated yet)
  ratingCount: number;
  cover?: string; // the first photo when it lives on Cloudinary (a short URL that is safe to send in lists)
  insuranceExpiry: Date; // end of the day the insurance is valid until - the ad is hidden after it
  expiresAt: Date; // the ad is deleted by itself after 60 days (owner can renew)
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IVehicle>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: CATEGORY_KEYS, required: true, index: true },
    make: { type: String, required: true, trim: true, maxlength: 40, index: true },
    vehicleModel: { type: String, required: true, trim: true, maxlength: 60 },
    year: { type: Number, min: 1900, max: 2100 },
    fuel: { type: String, enum: FUEL_KEYS, required: true, index: true },
    driver: { type: String, enum: DRIVER_KEYS, required: true, index: true },
    condition: { type: String, enum: CONDITION_KEYS, required: true, index: true },
    seats: { type: Number, min: 1, max: 100 },
    kmPerLitre: { type: Number, min: 0.5, max: 200 },
    district: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    priceType: { type: String, enum: PRICE_TYPE_KEYS, required: true },
    pricePerKm: { type: Number, min: 0 },
    pricePerDay: { type: Number, min: 0, index: true },
    pricePerMonth: { type: Number, min: 0, index: true },
    contactNumber: { type: String, required: true, trim: true },
    description: { type: String, maxlength: 1000, trim: true },
    images: { type: [String], default: [], select: false },
    imageCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    callClicks: { type: Number, default: 0 },
    featuredUntil: { type: Date, index: true },
    suspended: { type: Boolean, index: true },
    insuranceMailed: { type: Boolean, default: false },
    ratingAvg: { type: Number, default: 0, index: true },
    ratingCount: { type: Number, default: 0 },
    cover: String,
    insuranceExpiry: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

schema.pre('save', function () {
  // keep `cover` = first photo URL (Cloudinary) so lists can show it straight from the CDN without loading the photos
  if (this.isModified('images')) this.cover = isCloudUrl(this.images?.[0]) ? this.images[0] : undefined;
});

export const Vehicle = model<IVehicle>('Vehicle', schema);
