import { Types } from 'mongoose';
import { Vehicle } from '../models/vehicle.model';
import { Rating } from '../models/rating.model';
import { Favorite } from '../models/favorite.model';
import { Report } from '../models/report.model';

type Id = Types.ObjectId | string;

/** work out an ad's average stars again (stored on the ad so lists can show and sort it) */
export async function recalcRating(vehicleId: Id): Promise<{ ratingAvg: number; ratingCount: number }> {
  const [r] = await Rating.aggregate([{ $match: { vehicle: new Types.ObjectId(String(vehicleId)) } }, { $group: { _id: null, avg: { $avg: '$stars' }, n: { $sum: 1 } } }]);
  const summary = { ratingAvg: r ? Math.round(r.avg * 10) / 10 : 0, ratingCount: r ? r.n : 0 };
  await Vehicle.updateOne({ _id: vehicleId }, { $set: summary });
  return summary;
}

/** call AFTER ads were deleted: their ratings and hearts go, their open reports are closed (the report stays readable in the console) */
export async function removeAdData(vehicleIds: Id[]): Promise<void> {
  if (!vehicleIds.length) return;
  await Promise.all([
    Rating.deleteMany({ vehicle: { $in: vehicleIds } }),
    Favorite.deleteMany({ vehicle: { $in: vehicleIds } }),
    Report.updateMany({ vehicle: { $in: vehicleIds }, status: 'open' }, { $set: { status: 'resolved', adminNote: 'The ad was removed.', resolvedAt: new Date() } }),
  ]);
}

/** call when a user is deleted: their hearts go and their stars are taken off the ads they rated */
export async function removeUserData(userId: Id): Promise<void> {
  const rated = await Rating.distinct('vehicle', { user: userId });
  await Promise.all([Rating.deleteMany({ user: userId }), Favorite.deleteMany({ user: userId })]);
  await Promise.all(rated.map((v) => recalcRating(v)));
}
