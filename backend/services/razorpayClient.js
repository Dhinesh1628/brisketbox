import Razorpay from 'razorpay';

let injectedClient = null;
let defaultClient = null;

/**
 * Injects a custom/mock Razorpay client instance (e.g. for testing).
 */
export function setRazorpayClient(client) {
  injectedClient = client;
}

/**
 * Returns the active Razorpay client instance (injected or default).
 */
export function getRazorpayClient() {
  if (injectedClient) {
    return injectedClient;
  }
  if (defaultClient) {
    return defaultClient;
  }
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (key_id && key_secret) {
    try {
      defaultClient = new Razorpay({ key_id, key_secret });
      return defaultClient;
    } catch (e) {
      console.warn('[Razorpay] Client initialization failed:', e.message);
    }
  }
  return null;
}
