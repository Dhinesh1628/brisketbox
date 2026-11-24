export interface ProductVisualMeta {
  rawImage: string;
  cookedImage: string;
  cookedDishName: string;
  cookedDescription: string;
  cookingTime: string;
  flavorProfile: string[];
}

export const PRODUCT_VISUALS_MAP: Record<string, ProductVisualMeta> = {
  prod_1: {
    rawImage: '/images/products/prod_1.webp',
    cookedImage: '/images/products/cooked_surmai_tawa_fry.webp',
    cookedDishName: 'Mangalore Surmai Tawa Fry',
    cookedDescription: 'Crispy rava-crusted seer fish steaks with chili, curry leaves, and lemon.',
    cookingTime: '8 mins pan fry',
    flavorProfile: ['Spicy', 'Tangy', 'Crisp Edge']
  },
  prod_2: {
    rawImage: '/images/products/prod_2.webp',
    cookedImage: '/images/products/cooked_white_pomfret.webp',
    cookedDishName: 'Rechado White Pomfret Fry',
    cookedDescription: 'Whole scored pomfret stuffed with red rechado masala and pan-fried.',
    cookingTime: '10 mins shallow fry',
    flavorProfile: ['Tangy', 'Rechado Spiced', 'Flaky White']
  },
  prod_3: {
    rawImage: '/images/products/prod_3.webp',
    cookedImage: '/images/products/cooked_tiger_prawns.webp',
    cookedDishName: 'Butter Garlic Jumbo Prawns',
    cookedDescription: 'Tender jumbo prawns tossed in butter, garlic, and fresh herbs.',
    cookingTime: '5 mins quick toss',
    flavorProfile: ['Garlic Butter', 'Juicy Crunch', 'Mild Chili']
  },
  prod_4: {
    rawImage: '/images/products/prod_4.webp',
    cookedImage: '/images/products/cooked_mutton_rogan_josh.webp',
    cookedDishName: 'Kashmiri Mutton Rogan Josh',
    cookedDescription: 'Tender goat meat slow-simmered in rich gravy with whole spices.',
    cookingTime: '45 mins dum simmer',
    flavorProfile: ['Rich Rogan', 'Melt-in-mouth', 'Aromatic']
  },
  prod_5: {
    rawImage: '/images/products/prod_5.webp',
    cookedImage: '/images/products/cooked_chicken.webp',
    cookedDishName: 'Golden Herb Butter Chicken Breast',
    cookedDescription: 'Juicy golden-brown seared chicken breast fillets with fresh rosemary, cracked pepper & lemon butter.',
    cookingTime: '6 mins skillet sear',
    flavorProfile: ['High Protein', 'Herb Butter', 'Juicy Center']
  },
  prod_6: {
    rawImage: '/images/products/prod_6.webp',
    cookedImage: '/images/products/cooked_nati_koli.webp',
    cookedDishName: 'Andhra Nati Koli Pepper Roast',
    cookedDescription: 'Traditional country chicken cooked in clay pot with roasted peppercorns, curry leaves & village spices.',
    cookingTime: '30 mins rustic simmer',
    flavorProfile: ['Fiery Pepper', 'Rustic Country', 'Robust']
  },
  prod_7: {
    rawImage: '/images/products/prod_7.webp',
    cookedImage: '/images/products/cooked_fish_tikka.webp',
    cookedDishName: 'Amritsari Crispy Fish Tikka',
    cookedDescription: 'Crispy carom-seed (ajwain) and gram flour coated succulent fish nuggets with mint chutney & chaat masala.',
    cookingTime: '7 mins crisp fry / air-fry',
    flavorProfile: ['Ajwain Spiced', 'Crunchy Crust', 'Street-Style']
  },
  prod_8: {
    rawImage: '/images/products/prod_8.webp',
    cookedImage: '/images/products/cooked_tiger_prawns.webp',
    cookedDishName: 'Grand Coastal Seafood Feast',
    cookedDescription: 'Sumptuous celebration spread of crispy Surmai tawa steaks, butter garlic prawns & fragrant curry.',
    cookingTime: 'Feast Ready',
    flavorProfile: ['Seafood Platter', 'Tawa Fry', 'Family Feast']
  }
};

export function getProductVisual(productId: string, fallbackRaw?: string): ProductVisualMeta {
  if (PRODUCT_VISUALS_MAP[productId]) {
    return PRODUCT_VISUALS_MAP[productId];
  }
  return {
    rawImage: fallbackRaw || `/images/products/${productId}.webp`,
    cookedImage: '/images/products/cooked_surmai_tawa_fry.webp',
    cookedDishName: 'Chef Special Preparation',
    cookedDescription: 'Fresh cut ready for your favorite home-cooked recipe.',
    cookingTime: '15 mins',
    flavorProfile: ['Fresh', 'Tender']
  };
}
