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
 * Backed by a permanent ledger to prevent double spending.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.idempotencyKey
 * @param {string} [params.orderId]
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @returns {Promise<{ success: boolean, transaction: object, newBalance: number }>}
 */
export async function debitWallet({
  userId,
  amount,
  idempotencyKey,
  orderId = null,
  title = 'Order Payment',
  description = 'Store credit used for order'
}) {
  return withWalletLock(async () => {
    const numAmount = Math.round(Number(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error(`Invalid wallet debit amount: ${amount}`);
    }

    if (!idempotencyKey) {
      throw new Error('An idempotencyKey is required for wallet transactions');
    }

    const ledger = db.get('walletLedger') || [];
    const existingTx = ledger.find(tx => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      // Idempotency: return previously recorded transaction
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

    // Update user balance & user transaction history
    const userTransactions = [transaction, ...(user.walletTransactions || [])];
    db.update('users', user.id, {
      walletBalance: newBalance,
      walletTransactions: userTransactions
    });

    // Record in immutable ledger
    db.insert('walletLedger', transaction);

    return { success: true, transaction, newBalance };
  });
}

/**
 * Credits store credit to a user's wallet with an idempotency key.
 * Backed by an immutable ledger to prevent duplicate rewards or refunds.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.idempotencyKey
 * @param {string} [params.orderId]
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @returns {Promise<{ success: boolean, transaction: object, newBalance: number }>}
 */
export async function creditWallet({
  userId,
  amount,
  idempotencyKey,
  orderId = null,
  title = 'Wallet Credit',
  description = 'Store credit credited to wallet'
}) {
  return withWalletLock(async () => {
    const numAmount = Math.round(Number(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error(`Invalid wallet credit amount: ${amount}`);
    }

    if (!idempotencyKey) {
      throw new Error('An idempotencyKey is required for wallet transactions');
    }

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
