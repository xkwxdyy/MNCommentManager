// Independent demo transport. Never calls mnaddon:// or native note APIs.
export const DemoBridge = {
  async send(command, payload = {}) {
    const response = await fetch('/api/bridge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, payload }) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error?.message || '演示服务请求失败');
    return result.payload;
  },
};
