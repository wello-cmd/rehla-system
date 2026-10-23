export function getRoleLandingPath(role) {
  switch (role) {
    case 'ceo':
    case 'admin': return '/';
    case 'worker': return '/warehouse/exit';
    case 'accountant': return '/invoices';
    case 'dispatcher': return '/delivery';
    default: return '/forbidden';
  }
}

export const INVOICE_CREATE_ROLES = Object.freeze(['ceo', 'admin']);
export const canCreateInvoice = role => INVOICE_CREATE_ROLES.includes(role);
