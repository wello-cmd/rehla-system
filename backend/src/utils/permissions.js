// Server-side role groups. Public driver links are checked separately against
// the active driver's bearer token and assigned delivery, never a row ID.
const FINANCE_ROLES = Object.freeze(['admin', 'ceo', 'accountant']);
const DELIVERY_MANAGE_ROLES = Object.freeze(['admin', 'ceo', 'dispatcher', 'worker']);
const DELIVERY_READ_ROLES = Object.freeze([...DELIVERY_MANAGE_ROLES, 'driver']);
const DELIVERY_STATUS_ROLES = Object.freeze(['admin', 'ceo', 'dispatcher', 'driver']);
const DELIVERY_REPORT_ROLES = Object.freeze(['admin', 'ceo', 'dispatcher', 'accountant']);

module.exports = { FINANCE_ROLES, DELIVERY_MANAGE_ROLES, DELIVERY_READ_ROLES, DELIVERY_STATUS_ROLES, DELIVERY_REPORT_ROLES };
