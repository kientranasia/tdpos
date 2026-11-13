import { Product, ProductUnit } from '../types';
import { normalizeSearchText } from './utils';

export type ProductScanUnit = Pick<ProductUnit, 'name' | 'factor' | 'sku' | 'barcode'>;
export type ProductScanMatch = { product: Product; unit: ProductScanUnit };

export const productUnitsForScan = (product: Product): ProductScanUnit[] => product.units?.length
  ? product.units
  : [{ name: product.unit, factor: 1, sku: product.sku, barcode: product.barcode }];

export const createProductScanIndex = (products: Product[]) => {
  const index = new Map<string, ProductScanMatch>();
  const add = (value: string | null | undefined, product: Product, unit: ProductScanUnit) => {
    const code = normalizeSearchText(value);
    if (code && !index.has(code)) index.set(code, { product, unit });
  };

  products.forEach((product) => {
    const units = productUnitsForScan(product);
    const baseUnit = units[0];
    add(product.sku, product, baseUnit);
    add(product.barcode, product, baseUnit);
    units.forEach((unit) => {
      add(unit.sku, product, unit);
      add(unit.barcode, product, unit);
    });
  });
  return index;
};

export const findProductInScanIndex = (index: Map<string, ProductScanMatch>, code: string) => (
  index.get(normalizeSearchText(code)) || null
);

export const productScanFactor = (product: Product, code: string) => {
  const normalizedCode = normalizeSearchText(code);
  const unit = productUnitsForScan(product).find((row) => (
    normalizeSearchText(row.sku) === normalizedCode || normalizeSearchText(row.barcode) === normalizedCode
  ));
  return Math.max(1, Number(unit?.factor) || 1);
};
