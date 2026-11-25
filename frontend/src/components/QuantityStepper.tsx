import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useSound } from '../context/SoundContext';

interface QuantityStepperProps {
  quantity: number;
  onIncrement: (e?: React.MouseEvent) => void;
  onDecrement: (e?: React.MouseEvent) => void;
  itemName?: string;
  min?: number;
  max?: number;
  showTrashOnOne?: boolean;
  className?: string;
}

export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  quantity,
  onIncrement,
  onDecrement,
  itemName = 'item',
  min = 0,
  max = 20,
  showTrashOnOne = false,
  className = ''
}) => {
  const { playPopSound } = useSound();

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    playPopSound();
    onDecrement(e);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quantity >= max) return;
    playPopSound();
    onIncrement(e);
  };

  return (
    <div 
      data-testid="quantity-stepper"
      className={`inline-flex items-center border border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800 p-0.5 shadow-2xs ${className}`}
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label={`Quantity selector for ${itemName}`}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={quantity <= min}
        className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white disabled:opacity-40 cursor-pointer rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition active:scale-90"
        aria-label={quantity === 1 && showTrashOnOne ? `Remove ${itemName} from cart` : `Decrease ${itemName} quantity`}
      >
        {quantity === 1 && showTrashOnOne ? (
          <Trash2 className="w-3.5 h-3.5" />
        ) : (
          <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
        )}
      </button>

      <span 
        className="px-2 min-w-[28px] text-center text-sm font-black text-neutral-900 dark:text-white select-none tabular-nums"
        aria-live="polite"
      >
        {quantity}
      </span>

      <button
        type="button"
        onClick={handleIncrement}
        disabled={quantity >= max}
        className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white disabled:opacity-40 cursor-pointer rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition active:scale-90"
        aria-label={`Increase ${itemName} quantity`}
      >
        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
      </button>
    </div>
  );
};
