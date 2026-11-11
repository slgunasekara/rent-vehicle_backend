import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {connectDB} from '../config/db';
import {env} from '../config/env';
import {User} from '../models/user.model';

(async () => {
    await connectDB();
    const email = (env.adminEmails[0] || process.env.SEED_ADMIN_EMAIL || 'admin@findvehicle.lk').toLowerCase();
    const pass = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
    if (!(await User.findOne({email}))) {
        await User.create({
            name: 'Company Admin',
            email,
            role: 'admin',
            position: 'Owner',
            isDefaultAdmin: true,
            password: await bcrypt.hash(pass, 12)
        });
        console.log(`Admin created: ${email} / ${pass}   (change the password after the first login)`);
    } else {
        const r = await User.updateOne({email, role: {$ne: 'admin'}}, {$set: {role: 'admin'}});
        if (!(await User.exists({
            role: 'admin',
            isDefaultAdmin: true
        }))) await User.updateOne({email}, {$set: {isDefaultAdmin: true}});
        console.log(r.modifiedCount ? `Existing account ${email} is now an admin` : `Admin already exists: ${email}`);
    }
    await mongoose.disconnect();
})();
