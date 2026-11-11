import { Router } from 'express';
import { protect } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import * as v from '../controllers/vehicle.controller';

const r = Router();
r.get('/vehicles', v.searchVehicles);
r.get('/stats/public', v.publicStats);
r.get('/vehicles/mine', protect, v.myVehicles);
r.get('/vehicles/mine/:id', protect, v.myVehicle);
r.post('/vehicles', protect, writeLimiter, v.createVehicle);
r.get('/vehicles/:id', v.getVehicle);
r.get('/vehicles/:id/images/:n', v.vehicleImage);
r.put('/vehicles/:id', protect, writeLimiter, v.updateVehicle);
r.delete('/vehicles/:id', protect, v.deleteVehicle);
r.post('/vehicles/:id/renew', protect, writeLimiter, v.renewVehicle);
export default r;
