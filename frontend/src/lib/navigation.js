export function isNavigationActive(destination, pathname) {
  return destination === '/' ? pathname === '/' : pathname === destination || pathname.startsWith(`${destination}/`);
}

export function getPageParent(pathname) {
  return pathname.startsWith('/invoices/') ? {path:'/invoices',label:'Invoices'} : null;
}
