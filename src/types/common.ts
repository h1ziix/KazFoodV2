/** Shared fields entered once and automatically available in all protocol documents. */
export interface CommonData {
  customerName: string;
  customerAddress: string;
  organizationName: string;
  performerFullName: string;
  performerPosition: string;
  approvalFullName: string;
  approvalPosition: string;
  protocolDate: string;
}

export const EMPTY_COMMON_DATA: CommonData = {
  customerName: "",
  customerAddress: "",
  organizationName: "",
  performerFullName: "",
  performerPosition: "",
  approvalFullName: "",
  approvalPosition: "",
  protocolDate: "",
};
