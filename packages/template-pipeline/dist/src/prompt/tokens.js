export function imageIndex(token) {
    const match = /^<Image (\d+)>$/.exec(token);
    if (!match)
        return Number.POSITIVE_INFINITY;
    return Number(match[1]);
}
export function deliveryToken(index) {
    return `<Image ${index + 1}>`;
}
//# sourceMappingURL=tokens.js.map