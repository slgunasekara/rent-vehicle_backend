import { Router } from 'express';
import authRoutes from './auth.routes';
import vehicleRoutes from './vehicle.routes';
import adminRoutes from './admin.routes';
import contactRoutes from './contact.routes';
import chatRoutes from './chat.routes';
import engageRoutes from './engage.routes';
import extrasRoutes from './extras.routes';
import paymentRoutes from './payment.routes';

const r = Router();
r.use(authRoutes);
r.use(paymentRoutes);
r.use(extrasRoutes); // before the vehicle routes: /vehicles/by-ids and /vehicles/describe must not be read as an ad id
r.use(vehicleRoutes);
r.use(adminRoutes);
r.use(contactRoutes);
r.use(chatRoutes);
r.use(engageRoutes);
export default r;
