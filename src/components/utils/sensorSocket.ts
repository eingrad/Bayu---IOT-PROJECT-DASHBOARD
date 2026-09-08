type DataListener = (data: any, topic: string) => void;

const listeners = new Set<DataListener>();
let socket: WebSocket | null = null;

// Cache the latest payload per topic. When a component mounts (e.g. after
// switching pages) it subscribes and immediately receives the last known
// values, instead of showing 0 until the next broadcast (~1 min later).
const lastByTopic = new Map<string, any>();

export function startSensorSocket() {
  if (socket && socket.readyState <= 1) return; // Already connected or connecting

  socket = new WebSocket("ws://localhost:5000");

  socket.onopen = () => {
    console.log("🌐 WebSocket connected to sensor server");
  };

  socket.onmessage = (event) => {
    try {
      const { topic, data } = JSON.parse(event.data);
      const parsed = JSON.parse(data);
      lastByTopic.set(topic, parsed);
      listeners.forEach((cb) => cb(parsed, topic));
    } catch (err) {
      console.error("❌ Failed to parse WebSocket message:", err);
    }
  };

  socket.onclose = () => {
    console.warn("🔌 WebSocket disconnected. Retrying...");
    socket = null;
    setTimeout(startSensorSocket, 3000);
  };

  socket.onerror = (err) => {
    console.error("⚠️ WebSocket error:", err);
  };
}

export function subscribeToSensorData(cb: DataListener): () => void {
  listeners.add(cb);
  // Replay the most recent value on each topic so the component renders
  // immediately with the last known data.
  lastByTopic.forEach((parsed, topic) => cb(parsed, topic));
  return () => {
    listeners.delete(cb);
  };
}
