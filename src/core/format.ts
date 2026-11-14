export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  const whole = Math.floor(remainder);
  const tenth = Math.floor((remainder - whole) * 10);
  return `${minutes}:${whole.toString().padStart(2, "0")}.${tenth}`;
}
