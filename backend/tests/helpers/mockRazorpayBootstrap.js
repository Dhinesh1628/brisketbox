import { setRazorpayClient } from '../../services/razorpayClient.js';

export const mockClient = {
  payments: {
    async refund(paymentId, options = {}) {
      if (options.notes?.forceFail || options.receipt?.includes('force_fail')) {
        throw new Error('Simulated Razorpay gateway failure');
      }

      if (options.notes?.forcePending || options.receipt?.includes('force_pending')) {
        return {
          id: `rfnd_pnd_${Date.now()}`,
          entity: 'refund',
          amount: options.amount,
          currency: 'INR',
          payment_id: paymentId,
          status: 'pending',
          receipt: options.receipt,
          created_at: Math.floor(Date.now() / 1000)
        };
      }

      return {
        id: `rfnd_proc_${Date.now()}`,
        entity: 'refund',
        amount: options.amount,
        currency: 'INR',
        payment_id: paymentId,
        status: 'processed',
        receipt: options.receipt,
        created_at: Math.floor(Date.now() / 1000)
      };
    }
  },
  refunds: {
    async fetch(refundId) {
      if (refundId.includes('force_fail') || refundId.includes('pnd_fail')) {
        return {
          id: refundId,
          entity: 'refund',
          status: 'failed',
          error_description: 'Gateway settlement failed'
        };
      }
      return {
        id: refundId,
        entity: 'refund',
        status: 'processed'
      };
    }
  }
};

setRazorpayClient(mockClient);
