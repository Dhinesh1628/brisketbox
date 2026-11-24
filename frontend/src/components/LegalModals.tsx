import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface LegalModalProps {
  type: 'tos' | 'privacy' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(Boolean(type), modalRef, onClose);

  if (!type) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div onClick={onClose} className="fixed inset-0 bg-black/75 backdrop-blur-xs" />

      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-6 text-slate-200 z-10 max-h-[85vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 id="legal-modal-title" className="text-base font-semibold text-white">
            {type === 'tos' ? 'Terms of Service - BrisketBox India' : 'Privacy Policy - BrisketBox India'}
          </h2>
          <button 
            onClick={onClose} 
            className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-slate-400 hover:text-white p-1 focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close legal terms dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {type === 'tos' ? (
          <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-300">
            <p>
              <strong>1. Fresh Delivery & Quality:</strong> Every order is cut fresh and packed in insulated thermal packaging with gel ice packs. If your order arrives damaged, contact customer support promptly for resolution or replacement.
            </p>
            <p>
              <strong>2. Delivery Timing:</strong> Orders are prepared and scheduled for your selected delivery window. Times may vary based on route conditions and local weather.
            </p>
            <p>
              <strong>3. Product Quality Support:</strong> Products are packaged with ice packs designed to keep meat and fish chilled during local delivery. If you have any packaging concerns upon arrival, reach out to our support team.
            </p>
            <p>
              <strong>4. Order Cancellations & Delivery Slots:</strong> Morning orders (7:00 AM – 9:00 AM) can be rescheduled up to 10:00 PM the previous evening. Evening orders can be modified up to 2:00 PM on the delivery date.
            </p>
            <p>
              <strong>5. Governing Law:</strong> These terms are governed by the laws of India, under the jurisdiction of courts in Bengaluru, Karnataka.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-300">
            <p>
              <strong>1. Information Collection:</strong> We collect your name, delivery address, and contact number solely for order fulfillment, delivery updates, and customer support.
            </p>
            <p>
              <strong>2. Data Usage:</strong> Your delivery coordinates are shared only with the assigned local delivery partner (e.g. EV delivery executives in Bengaluru, Mumbai, or Hyderabad) to complete your drop-off.
            </p>
            <p>
              <strong>3. Payment Security:</strong> We do not store debit/credit card numbers or UPI PINs. Transactions are processed through RBI-licensed payment gateways.
            </p>
            <p>
              <strong>4. Account Deletion & Rights:</strong> Under the Digital Personal Data Protection Act (DPDP), you can request complete erasure of your profile and address history by contacting support@brisketbox.in.
            </p>
          </div>
        )}

        <div className="mt-6 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
