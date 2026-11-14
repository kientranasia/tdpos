import { Invoice } from '../types';

export interface InvoiceReceiptSummary {
  totalAmount: number;
  discount: number;
  amountDue: number;
  previousDebt: number;
  grandTotal: number;
  paidAmount: number;
  changeAmount: number;
  debtAmount: number;
  remainingDebt: number;
}

export const getInvoiceReceiptSummary = (invoice: Pick<Invoice, 'totalAmount' | 'discount' | 'finalAmount' | 'paidAmount' | 'debtAmount' | 'previousDebtAmount' | 'changeAmount'>): InvoiceReceiptSummary => {
  const totalAmount = Number(invoice.totalAmount) || 0;
  const discount = Number(invoice.discount) || 0;
  const amountDue = Math.max(0, Number(invoice.finalAmount) || 0);
  const previousDebt = Math.max(0, Number(invoice.previousDebtAmount) || 0);
  const paidAmount = Math.max(0, Number(invoice.paidAmount) || 0);
  const changeAmount = Math.max(0, Number(invoice.changeAmount ?? paidAmount - amountDue) || 0);
  const remainingDebt = Math.max(0, previousDebt + amountDue - paidAmount - changeAmount);

  return {
    totalAmount,
    discount,
    amountDue,
    previousDebt,
    // Remaining amount after applying the customer's payment to this receipt
    // and any outstanding balance carried into it.
    grandTotal: Math.max(0, amountDue + previousDebt - paidAmount),
    paidAmount,
    changeAmount,
    debtAmount: Math.max(0, Number(invoice.debtAmount) || 0),
    remainingDebt,
  };
};
