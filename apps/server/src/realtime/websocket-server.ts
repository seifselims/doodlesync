import { WebSocketServer } from "ws";

// Shared by production startup and live transport tests.
export function createWebSocketServer() {
	return new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
}
