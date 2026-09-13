let appPromise: Promise<any> | undefined;

async function getApp() {
  appPromise ??= import('../src/server.js').then(({ app }) => app);
  return appPromise;
}

export default async function handler(request: any, response: any) {
  try {
    const app = await getApp();
    await app.ready();
    app.server.emit('request', request, response);
  } catch (error) {
    console.error('LalaPay Vercel handler failed:', error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ success: false, message: 'Internal server error' }));
    }
  }
}
