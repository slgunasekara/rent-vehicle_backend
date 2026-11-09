/** Shared option lists. The SAME file lives in frontend/src/data/vehicleOptions.ts - keep the two identical. */

export const CATEGORIES = [
  { key: 'car', label: 'Cars', one: 'Car' },
  { key: 'suv', label: 'SUVs', one: 'SUV' },
  { key: 'van', label: 'Vans', one: 'Van' },
  { key: 'bus', label: 'Buses', one: 'Bus' },
  { key: 'motorbike', label: 'Motorbikes', one: 'Motorbike' },
  { key: 'lorry', label: 'Lorries', one: 'Lorry' },
  { key: 'three_wheel', label: 'Three Wheels', one: 'Three Wheel' },
  { key: 'pickup', label: 'Pickups', one: 'Pickup' },
  { key: 'heavy_duty', label: 'Heavy-Duty', one: 'Heavy-Duty' },
] as const;
export type Category = (typeof CATEGORIES)[number]['key'];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [Category, ...Category[]];

export const FUELS = [
  { key: 'petrol', label: 'Petrol' },
  { key: 'diesel', label: 'Diesel' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'electric', label: 'Electric' },
  { key: 'other', label: 'Other (CNG / LPG)' },
] as const;
export type Fuel = (typeof FUELS)[number]['key'];
export const FUEL_KEYS = FUELS.map((f) => f.key) as [Fuel, ...Fuel[]];

/** can the hirer drive it alone, or does the owner supply a driver? */
export const DRIVERS = [
  { key: 'with', label: 'With driver' },
  { key: 'without', label: 'Without driver' },
  { key: 'both', label: 'Both (with or without driver)' },
] as const;
export type DriverOpt = (typeof DRIVERS)[number]['key'];
export const DRIVER_KEYS = DRIVERS.map((d) => d.key) as [DriverOpt, ...DriverOpt[]];

export const CONDITIONS = [
  { key: 'antique', label: 'Antique' },
  { key: 'brand_new', label: 'Brand New' },
  { key: 'registered', label: 'Registered (Used)' },
  { key: 'unregistered', label: 'Unregistered (Recondition)' },
] as const;
export type Condition = (typeof CONDITIONS)[number]['key'];
export const CONDITION_KEYS = CONDITIONS.map((c) => c.key) as [Condition, ...Condition[]];

/** how the owner shows the price. The company takes nothing - the hirer and the owner agree on the phone. */
export const PRICE_TYPES = [
  { key: 'per_km', label: 'Per km' },
  { key: 'per_day', label: 'Per day' },
  { key: 'km_and_day', label: 'Per km and per day' },
  { key: 'per_month', label: 'Per month' },
  { key: 'call', label: 'Call now for the price' },
] as const;
export type PriceType = (typeof PRICE_TYPES)[number]['key'];
export const PRICE_TYPE_KEYS = PRICE_TYPES.map((p) => p.key) as [PriceType, ...PriceType[]];

/**
 * Every make an ad can have - the list Sri Lankan sites such as Riyasewana use (cars, vans, SUVs, buses, lorries, three-wheelers, motorbikes, tractors).
 * POPULAR_MAKES are shown first in the pickers ("Most Popular Makes"); MAKES is everything, A to Z, ending with "Other".
 */
export const POPULAR_MAKES = [
  'Toyota', 'Suzuki', 'Honda', 'Nissan', 'Mitsubishi', 'Tata', 'Bajaj', 'TVS', 'Isuzu', 'Mahindra', 'Mazda', 'Hero', 'Micro', 'Daihatsu', 'Hyundai', 'Hero Honda', 'DFSK', 'Mercedes-Benz', 'Kia', 'BMW', 'Yamaha', 'Ashok Leyland', 'Perodua', 'Audi', 'Ford', 'Land Rover',
];
export const MAKES = [
  'Acura', 'Ashok Leyland', 'Ather', 'Atco', 'Audi', 'Austin', 'Baic', 'Bajaj', 'BAW', 'BMW', 'Borgward', 'BYD', 'CAT', 'Changan', 'Chery', 'Chevrolet', 'Citroen', 'DAF', 'Daewoo', 'Daihatsu', 'Datsun', 'Deepal', 'Demak', 'Denza', 'DFSK', 'Dongfeng', 'Dyno', 'Eicher', 'FAW', 'Fiat', 'Force', 'Ford', 'Foton', 'GAC', 'Haval', 'Hero', 'Hero Honda', 'Higer', 'Hino', 'Holden', 'Honda', 'Hummer', 'Hyundai', 'Isuzu', 'JAC', 'Jaecoo', 'Jaguar', 'JCB', 'Jeep', 'Jetour', 'JMC', 'Jonway', 'Kawasaki', 'Kia', 'Kinetic', 'Komatsu', 'KTM', 'Kubota', 'Land Rover', 'Lexus', 'Loncin', 'Mahindra', 'MAN', 'Massey Ferguson', 'Mazda', 'Mercedes-Benz', 'MG', 'Micro', 'Mini', 'Mitsubishi', 'Morris', 'Nissan', 'Perodua', 'Peugeot', 'Piaggio', 'Porsche', 'Proton', 'Range Rover', 'Ranomoto', 'Renault', 'Senaro', 'Singer', 'SsangYong', 'Subaru', 'Suzuki', 'TAFE', 'Tata', 'Toyota', 'Triumph', 'TVS', 'Volkswagen', 'Volvo', 'Willys', 'Yadea', 'Yamaha', 'Yanmar', 'Yuejin', 'Zotye', 'Other',
];

export const AD_DAYS = 60; // an ad is removed by itself after 60 days
export const MAX_PHOTOS = 8;

/** why an ad can be reported (shown in the report form and in the Company console) */
export const REPORT_REASONS = [
  { key: 'scam', label: 'Looks like a scam or a fake ad' },
  { key: 'wrong_info', label: 'Wrong details, price or photos' },
  { key: 'unavailable', label: 'Vehicle is not available any more' },
  { key: 'inappropriate', label: 'Inappropriate or offensive content' },
  { key: 'duplicate', label: 'Duplicate ad' },
  { key: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['key'];
export const REPORT_REASON_KEYS = REPORT_REASONS.map((r) => r.key) as [ReportReason, ...ReportReason[]];
