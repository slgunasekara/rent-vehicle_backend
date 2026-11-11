import {Schema, model, Document, Types} from 'mongoose';


export interface IViewLog extends Document {
    vehicle: Types.ObjectId;
    kind: 'view' | 'call';
    viewer: string;
    expireAt: Date
}

const schema = new Schema<IViewLog>({
    vehicle: {type: Schema.Types.ObjectId, ref: 'Vehicle', required: true},
    kind: {type: String, enum: ['view', 'call'], required: true},
    viewer: {type: String, required: true},
    expireAt: {type: Date, required: true},
});
schema.index({vehicle: 1, kind: 1, viewer: 1}, {unique: true});
schema.index({expireAt: 1}, {expireAfterSeconds: 0});
export const ViewLog = model<IViewLog>('ViewLog', schema);
