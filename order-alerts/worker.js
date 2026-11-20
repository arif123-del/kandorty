self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('طلب جديد في كندورتي', {
    body: 'اضغطي لعرض الطلبات في لوحة الإدارة.',
    lang: 'ar', dir: 'rtl', silent: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/admin.html?view=orders'));
});
