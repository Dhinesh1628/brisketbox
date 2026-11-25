import React, { useState } from 'react';
import { MessageCircle, X, ChevronRight, Sparkles, UtensilsCrossed, ExternalLink } from 'lucide-react';
import { WhatsAppChatbotModal } from './WhatsAppChatbotModal';
import { useCart } from '../context/CartContext';

interface WhatsAppButtonProps {
  isChatbotOpen?: boolean;
  onOpenChatbot?: () => void;
  onCloseChatbot?: () => void;
  onNavigateTab?: (tab: 'catalog' | 'tracking' | 'dashboard' | 'coolers' | 'admin') => void;
  isCheckoutOpen?: boolean;
  isProductPage?: boolean;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  isChatbotOpen: controlledIsOpen,
  onOpenChatbot,
  onCloseChatbot,
  onNavigateTab,
  isCheckoutOpen = false,
  isProductPage = false
}) => {
  const { isCartOpen, totalItems } = useCart();
  const [internalChatbotOpen, setInternalChatbotOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const supportPhone = import.meta.env.VITE_SUPPORT_PHONE || '';
  const phoneNumber = supportPhone ? supportPhone.replace(/[^0-9]/g, '') : '';

  // Rule 11: Hidden while cart or checkout is open
  if (isCartOpen || isCheckoutOpen) return null;

  const isChatbotOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalChatbotOpen;

  const openChatbot = () => {
    setIsMenuOpen(false);
    if (onOpenChatbot) {
      onOpenChatbot();
    } else {
      setInternalChatbotOpen(true);
    }
  };

  const closeChatbot = () => {
    if (onCloseChatbot) {
      onCloseChatbot();
    } else {
      setInternalChatbotOpen(false);
    }
  };

  const handleOpenWhatsAppDirect = (message: string) => {
    const encoded = encodeURIComponent(message);
    if (phoneNumber) {
      window.open(`https://wa.me/${phoneNumber}?text=${encoded}`, '_blank');
    } else {
      openChatbot();
    }
  };

  const isElevated = totalItems > 0 || isProductPage;

  return (
    <>
      <div className={`fixed ${isElevated ? 'bottom-20 sm:bottom-5' : 'bottom-4 sm:bottom-5'} right-3 sm:right-6 z-40 flex flex-col items-end gap-2 transition-all duration-300 pointer-events-auto`}>
        
        {/* Quick WhatsApp Action Menu */}
        {isMenuOpen && (
          <div className="mb-2 w-80 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden text-neutral-800 dark:text-neutral-100 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="bg-neutral-800 dark:bg-neutral-950 text-white p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center p-0.5 shadow-xs">
                  <img src="/images/logo.webp" alt="BrisketBox" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h4 className="font-bold text-xs leading-tight">BrisketBox Concierge Support</h4>
                  <div className="flex items-center gap-1 text-xs text-neutral-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Support Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-2 bg-neutral-50 dark:bg-neutral-900/80 text-xs">
              <button
                onClick={() => openChatbot()}
                className="w-full text-left p-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500 rounded-xl flex items-center justify-between group shadow-2xs transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  <div>
                    <div className="font-bold text-neutral-900 dark:text-white text-xs flex items-center gap-1">
                      <span>Master Butcher Concierge</span>
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">Recipes, prep advice & instant answers</div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200" />
              </button>

              {phoneNumber && (
                <button
                  onClick={() => handleOpenWhatsAppDirect("Hello BrisketBox! I have a question about fresh cuts and orders.")}
                  className="w-full text-left p-2.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500 rounded-xl flex items-center justify-between group shadow-2xs transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                    <div>
                      <div className="font-bold text-neutral-900 dark:text-white text-xs">Direct Support ({supportPhone})</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">Order assistance & questions</div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200" />
                </button>
              )}

            </div>
          </div>
        )}

        {/* SINGLE FLOATING BUTTON (Rule 11: Neutral white with grey border and dark icon) */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            data-testid="chat-support-button"
            className="group min-h-[44px] flex items-center gap-2 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 px-4 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
            <span className="font-semibold text-xs tracking-wide">
              Chat & Support
            </span>
          </button>
        </div>
      </div>

      {/* Interactive Master Butcher Concierge Modal */}
      <WhatsAppChatbotModal
        isOpen={isChatbotOpen}
        onClose={closeChatbot}
        whatsappNumber={phoneNumber}
        onNavigateTab={onNavigateTab}
      />
    </>
  );
};
