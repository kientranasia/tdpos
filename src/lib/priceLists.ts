export type PriceListMarkupMode = 'percent' | 'amount';

export type PriceListAdjustment = {
  mode: PriceListMarkupMode;
  value: number;
};

export const getPriceListAdjustment = (list?: any): PriceListAdjustment => {
  const mode: PriceListMarkupMode = list?.markupMode === 'amount' ? 'amount' : 'percent';
  const rawValue = mode === 'amount'
    ? list?.markupValue
    : Number(list?.markupValue) || Number(list?.markupPercent);
  return { mode, value: Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0 };
};

export const applyPriceListAdjustment = (basePrice: number, list?: any) => {
  const { mode, value } = getPriceListAdjustment(list);
  const base = Number(basePrice) || 0;
  return Math.max(0, mode === 'amount' ? base + value : base * (1 + value / 100));
};

export const formatPriceListAdjustment = (list?: any) => {
  if (!list || list.isDefault) return 'Giá cơ sở';
  const { mode, value } = getPriceListAdjustment(list);
  const sign = value >= 0 ? '+' : '';
  return mode === 'amount'
    ? `${sign}${value.toLocaleString('vi-VN')}đ so với cơ sở`
    : `${sign}${value}% so với cơ sở`;
};
