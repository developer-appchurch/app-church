// Service Worker para Web Push Notifications do AppChurch

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let notificationData = {
    title: '🔔 Relatório pendente',
    body: 'O relatório da sua célula referente à semana passada ainda não foi lançado. Acesse o AppChurch para registrar o relatório.',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    data: {
      url: '/?screen=reports&openModal=true',
    },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      notificationData = {
        ...notificationData,
        ...parsed,
        data: {
          ...notificationData.data,
          ...(parsed.data || {}),
        },
      };
    } catch (e) {
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  const tag =
    notificationData.data?.cellId
      ? `pending-report-${notificationData.data.cellId}`
      : 'pending-report';

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/android-chrome-192x192.png',
    badge: notificationData.badge || '/android-chrome-192x192.png',
    vibrate: [200, 100, 200],
    tag: tag,
    renotify: true,
    requireInteraction: true, // Mantém visível até o usuário interagir
    data: notificationData.data,
    actions: [
      {
        action: 'open_report',
        title: 'Lançar Relatório',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(notificationData.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data?.url || '/?screen=reports&openModal=true';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se houver uma janela do AppChurch aberta, foca e navega
        for (const client of clientList) {
          if ('focus' in client) {
            if ('navigate' in client) {
              return client.navigate(targetUrl).then((focusedClient) => {
                return focusedClient ? focusedClient.focus() : client.focus();
              });
            }
            return client.focus();
          }
        }
        // Se nenhuma janela estiver aberta, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
