export function circleRectCollide(cx, cy, cr, rx, ry, rw, rh){
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX, dy = cy - closestY;
  return (dx * dx + dy * dy) < (cr * cr);
}

export function normalizeAngle(a){
  while (a > Math.PI)  a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
