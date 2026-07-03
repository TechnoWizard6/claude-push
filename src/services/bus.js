// In-process pub/sub feeding the SSE stream. Swap for Redis pub/sub or Kafka
// when running more than one server instance.
const clients = new Set();

export function subscribe(res) {
  clients.add(res);
  return () => clients.delete(res);
}

export function publish(type, data) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}
