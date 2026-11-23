import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { WalletLedger } from '../models/WalletLedger.js';
import { db } from '../db.js';
import crypto from 'crypto';

let walletMutex = Promise.resolve();

function withWalletLock(callback) {
  const nextLock = walletMutex.then(async () => {
    try {
      return await callback();
    } catch (err) {
      throw err;
    }
  });
  walletMutex = nextLock.catch(() => {});
  return nextLock;
}

/**
 * Debits store credit from a user's wallet with an idempotency key.
 * Backed by an immutable MongoDB ledger with unique index on idempotencyKey.
 * In MongoDB, uses atomic $inc with condition { walletBalance: { $gte: numAmount } }.
 * Never executes $set of walletBalance from memory.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.idempotencyKey
 * @param {string} [params.orderId]
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @param {{ session?: mongoose.ClientSession }} [options]
 */
export async function debitWallet({
  userId,
  amount,
  idempotencyKey,
  orderId = null,
  title = 'Order Payment',
  description = 'Store credit used for order'
}, options = {}) {
  return withWalletLock(async () => {
    const numAmount = Math.round(Number(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error(`Invalid wallet debit amount: ${amount}`);
    }

    if (!idempotencyKey) {
      throw new Error('An idempotencyKey is required for wallet transactions');
    }

    const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
    const session = options.session || null;

    if (isMongo) {
      const existingLedger = await WalletLedger.findOne({ idempotencyKey }).session(session);
      if (existingLedger) {
        const u = await User.findOne({ id: userId }).session(session);
        return {
          success: true,
          transaction: existingLedger.toObject ? existingLedger.toObject() : existingLedger,
          newBalance: u ? u.walletBalance : existingLedger.balanceAfter,
          isIdempotentReplay: true
        };
      }

      const txId = `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const userBefore = await User.findOne({ id: userId }).session(session);
      if (!userBefore) {
        throw new Error(`User "${userId}" not found for wallet debit`);
      }
      if ((userBefore.walletBalance || 0) < numAmount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${userBefore.walletBalance || 0}, Requested: ₹${numAmount}`);
      }

      const transaction = {
        id: txId,
        idempotencyKey,
        userId,
        amount: numAmount,
        type: 'debit',
        title,
        description,
        balanceBefore: userBefore.walletBalance,
        balanceAfter: userBefore.walletBalance - numAmount,
        orderId,
        timestamp: new Date().toISOString()
      };

      const updatedUser = await User.findOneAndUpdate(
        { id: userId, walletBalance: { $gte: numAmount } },
        { 
          $inc: { walletBalance: -numAmount },
          $push: { walletTransactions: transaction }
        },
        { new: true, session }
      );

      if (!updatedUser) {
        throw new Error(`Insufficient wallet balance during concurrent transaction.`);
      }

      await WalletLedger.create([transaction], { session });

      return { success: true, transaction, newBalance: updatedUser.walletBalance };
    }

    // LowDB fallback (only active when MongoDB is not connected)
    const ledger = db.get('walletLedger') || [];
    const existingTx = ledger.find(tx => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      const user = db.findById('users', userId);
      return {
        success: true,
        transaction: existingTx,
        newBalance: user ? user.walletBalance : existingTx.balanceAfter,
        isIdempotentReplay: true
      };
    }

    const user = db.findById('users', userId);
    if (!user) {
      throw new Error(`User "${userId}" not found for wallet debit`);
    }

    const currentBalance = Number(user.walletBalance || 0);
    if (currentBalance < numAmount) {
      throw new Error(`Insufficient wallet balance. Available: ₹${currentBalance}, Requested: ₹${numAmount}`);
    }

    const newBalance = currentBalance - numAmount;
    const txId = `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const transaction = {
      id: txId,
      idempotencyKey,
      userId,
      amount: numAmount,
      type: 'debit',
      title,
      description,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      orderId,
      timestamp: new Date().toISOString()
    };

    const userTransactions = [transaction, ...(user.walletTransactions || [])];
    db.update('users', user.id, {
      walletBalance: newBalance,
      walletTransactions: userTransactions
    });

    db.insert('walletLedger', transaction);

    return { success: true, transaction, newBalance };
  });
}

/**
 * Credits store credit to a user's wallet with an idempotency key.
 * Backed by an immutable MongoDB ledger with unique index on idempotencyKey.
 * In MongoDB, uses atomic $inc.
 * Never executes $set of walletBalance from memory.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.idempotencyKey
 * @param {string} [params.orderId]
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @param {{ session?: mongoose.ClientSession }} [options]
 */
export async function creditWallet({
  userId,
  amount,
  idempotencyKey,
  orderId = null,
  title = 'Wallet Credit',
  description = 'Store credit credited to wallet'
}, options = {}) {
  return withWalletLock(async () => {
    const numAmount = Math.round(Number(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error(`Invalid wallet credit amount: ${amount}`);
    }

    if (!idempotencyKey) {
      throw new Error('An idempotencyKey is required for wallet transactions');
    }

    const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
    const session = options.session || null;

    if (isMongo) {
      const existingLedger = await WalletLedger.findOne({ idempotencyKey }).session(session);
      if (existingLedger) {
        const u = await User.findOne({ id: userId }).session(session);
        return {
          success: true,
          transaction: existingLedger.toObject ? existingLedger.toObject() : existingLedger,
          newBalance: u ? u.walletBalance : existingLedger.balanceAfter,
          isIdempotentReplay: true
        };
      }

      const txId = `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const userBefore = await User.findOne({ id: userId }).session(session);
      if (!userBefore) {
        throw new Error(`User "${userId}" not found for wallet credit`);
      }

      const transaction = {
        id: txId,
        idempotencyKey,
        userId,
        amount: numAmount,
        type: 'credit',
        title,
        description,
        balanceBefore: userBefore.walletBalance || 0,
        balanceAfter: (userBefore.walletBalance || 0) + numAmount,
        orderId,
        timestamp: new Date().toISOString()
      };

      const updatedUser = await User.findOneAndUpdate(
        { id: userId },
        { 
          $inc: { walletBalance: numAmount },
          $push: { walletTransactions: transaction }
        },
        { new: true, session }
      );

      await WalletLedger.create([transaction], { session });

      return { success: true, transaction, newBalance: updatedUser.walletBalance };
    }

    // LowDB fallback (only active when MongoDB is not connected)
    const ledger = db.get('walletLedger') || [];
    const existingTx = ledger.find(tx => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      const user = db.findById('users', userId);
      return {
        success: true,
        transaction: existingTx,
        newBalance: user ? user.walletBalance : existingTx.balanceAfter,
        isIdempotentReplay: true
      };
    }

    const user = db.findById('users', userId);
    if (!user) {
      throw new Error(`User "${userId}" not found for wallet credit`);
    }

    const currentBalance = Number(user.walletBalance || 0);
    const newBalance = currentBalance + numAmount;
    const txId = `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const transaction = {
      id: txId,
      idempotencyKey,
      userId,
      amount: numAmount,
      type: 'credit',
      title,
      description,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      orderId,
      timestamp: new Date().toISOString()
    };

    const userTransactions = [transaction, ...(user.walletTransactions || [])];
    db.update('users', user.id, {
      walletBalance: newBalance,
      walletTransactions: userTransactions
    });

    db.insert('walletLedger', transaction);

    return { success: true, transaction, newBalance };
  });
}
