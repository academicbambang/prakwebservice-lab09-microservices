const endpoints = ['/health', '/auth/health', '/catalog/health', '/orders/health', '/payments/health'];
try {
  const results = await Promise.all(endpoints.map(path => fetch('http://127.0.0.1:3000' + path, { signal: AbortSignal.timeout(2500) })));
  if (results.some(result => !result.ok)) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
