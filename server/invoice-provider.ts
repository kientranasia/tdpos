/**
 * Adapter boundary for future Vietnamese e-invoice providers.
 * MVP only stores the source document and exports normalized data; no provider
 * is called from the sales flow yet.
 */
export interface InvoiceProvider {
  createInvoice(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getInvoiceStatus(invoiceId: string): Promise<Record<string, unknown>>;
  cancelInvoice(invoiceId: string, reason?: string): Promise<Record<string, unknown>>;
  replaceInvoice(invoiceId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  exportInvoiceData(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class PendingInvoiceProvider implements InvoiceProvider {
  async createInvoice(input: Record<string, unknown>) { return { status: 'not_configured', input }; }
  async getInvoiceStatus(invoiceId: string) { return { status: 'not_configured', invoiceId }; }
  async cancelInvoice(invoiceId: string, reason?: string) { return { status: 'not_configured', invoiceId, reason }; }
  async replaceInvoice(invoiceId: string, input: Record<string, unknown>) { return { status: 'not_configured', invoiceId, input }; }
  async exportInvoiceData(input: Record<string, unknown>) { return { status: 'ready_for_export', input }; }
}
