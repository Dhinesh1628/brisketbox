import React, { useState } from 'react';
import { MessageCircle, X, ChevronRight, Sparkles, UtensilsCrossed, ExternalLink } from 'lucide-react';
import { WhatsAppChatbotModal } from './WhatsAppChatbotModal';
import { useCart } from '../context/CartContext';

interface WhatsAppButtonProps {
  isChatbotOpen?: boolean;
  onOpenChatbot?: () => void;
  onCloseChatbot?: () => void;
  onNavigateTab?: (tab: 'catalog' | 'tracking' | 'dashboard' | 'coolers' | 'admin') => void;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  isChatbotOpen: controlledIsOpen,
  onOpenChatbot,
  onCloseChatbot,
  onNavigateTab
}) => {
  const { totalItems } = useCart();
  const [internalChatbotOpen, setInternalChatbotOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const phoneNumber = '919741288301'; // Official BrisketBox Direct WhatsApp Concierge: +91 97412 88301

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

  return (
    <>
      <div className={`fixed ${totalItems > 0 ? 'bottom-20 sm:bottom-5' : 'bottom-4 sm:bottom-5'} right-3 sm:right-6 z-40 flex flex-col items-end gap-2 transition-all duration-300 pointer-events-auto`}>
        
        {/* Quick WhatsApp Action Menu */}
        {isMenuOpen && (
          <div className="mb-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden text-gray-800 dark:text-gray-100 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="bg-[#128C7E] text-white p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center p-0.5 shadow-xs">
                  <img src="/images/logo.png" alt="BrisketBox" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h4 className="font-bold text-xs leading-tight">BrisketBox Concierge Support</h4>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Direct Concierge</span>
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

            <div className="p-3 space-y-2 bg-gray-50 dark:bg-slate-800/80 text-xs">
              <button
                onClick={() => openChatbot()}
                className="w-full text-left p-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl flex items-center justify-between group shadow-2xs hover:bg-emerald-50/40 dark:hover:bg-emerald-950/40 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white text-[11px] flex items-center gap-1">
                      <span>Master Butcher Concierge</span>
                      <Sparkles className="w-3 h-3 text-amber-400" />
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Recipes, prep advice & instant answers</div>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-500" />
              </button>

              <button
                onClick={() => handleOpenWhatsAppDirect("Hello BrisketBox! I want to order fresh seafood/meat from today's harbor batch.")}
                className="w-full text-left p-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-[#128C7E] dark:hover:border-[#128C7E] rounded-xl flex items-center justify-between group shadow-2xs hover:bg-emerald-50/40 dark:hover:bg-emerald-950/40 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#128C7E]" />
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white text-[11px]">Direct WhatsApp (+91 97412 88301)</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Quick order & 90-min chilled slot booking</div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#128C7E]" />
              </button>

            </div>
          </div>
        )}

        {/* SINGLE FLOATING BUTTON */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="group flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer"
            aria-label="Help and WhatsApp"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
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
