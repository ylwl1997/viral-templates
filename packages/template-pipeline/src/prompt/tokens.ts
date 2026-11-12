export function imageIndex(token: string): number {
  const match = /^<Image (\d+)>$/.exec(token);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]);
}

export function deliveryToken(index: number): string {
  return `<Image ${index + 1}>`;
}
