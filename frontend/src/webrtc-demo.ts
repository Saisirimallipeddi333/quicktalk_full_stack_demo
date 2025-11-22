// Minimal WebRTC call skeleton for documentation/demo.
// In a real app, you'd use your WebSocket signaling channel to exchange SDP/ICE between peers.

export async function createPeerConnection() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  })
  return pc
}
