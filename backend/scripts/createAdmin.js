import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectMongoDB } from '../mongo.js';
import { User, normalizePhone } from '../models/User.js';

/**
 * Secure one-time admin creation script.
 * Reads credentials strictly from environment variables:
 * - ADMIN_EMAIL
 * - ADMIN_PASSWORD
 * - ADMIN_NAME (optional)
 * - ADMIN_PHONE (optional)
 * Never prints, logs, or leaks passwords.
 * Exits cleanly.
 */
export async function createAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = (process.env.ADMIN_NAME || 'Operations Admin').trim();
  const phone = (process.env.ADMIN_PHONE || '').trim();

  if (!email || !password) {
    console.error('[CreateAdmin Error] ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.');
    process.exit(1);
  }

  await connectMongoDB();
  if (mongoose.connection.readyState !== 1) {
    console.error('[CreateAdmin Error] MongoDB is not connected.');
    process.exit(1);
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    const hashedPassword = await bcrypt.hash(password, 10);

    if (existing) {
      existing.role = 'admin';
      existing.approvalStatus = 'approved';
      existing.password = hashedPassword;
      existing.name = name;
      if (phone) existing.phone = normalizePhone(phone);
      await existing.save();
      console.log(`[CreateAdmin] Admin account updated successfully for ${email}.`);
    } else {
      await User.create({
        id: `usr_admin_${Date.now()}`,
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'admin',
        approvalStatus: 'approved',
        phone: normalizePhone(phone)
      });
      console.log(`[CreateAdmin] Admin account created successfully for ${email}.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('createAdmin.js');
if (isDirectRun) {
  createAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[CreateAdmin Error]:', err.message);
      process.exit(1);
    });
}
