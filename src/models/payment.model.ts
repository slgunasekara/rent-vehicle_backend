import {Schema, model, Document, Types} from 'mongoose';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface IPayment extends Document {
    orderId: string;
    user: Types.ObjectId;
    vehicle: Types.ObjectId;
    days: number;
    amount: number;
    currency: string;
    status: PaymentStatus;
    method: 'payhere' | 'demo' | 'admin';
    payherePaymentId?: string;
    paidAt?: Date;
    adTitle: string;
    userName: string;
    userEmail: string;
    createdAt: Date;
}

const schema = new Schema<IPayment>(
    {
        orderId: {type: String, required: true, unique: true},
        user: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
        vehicle: {type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true},
        days: {type: Number, required: true},
        amount: {type: Number, required: true},
        currency: {type: String, default: 'LKR'},
        status: {type: String, enum: ['pending', 'paid', 'failed', 'cancelled'], default: 'pending', index: true},
        method: {type: String, enum: ['payhere', 'demo', 'admin'], required: true},
        payherePaymentId: String,
        paidAt: Date,
        adTitle: {type: String, default: ''},
        userName: {type: String, default: ''},
        userEmail: {type: String, default: ''},
    },
    {timestamps: true}
);
export const Payment = model<IPayment>('Payment', schema);
