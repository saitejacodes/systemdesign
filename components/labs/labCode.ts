/** "L-01" for order 1. */
export const labCode = (order: number) => `L-${String(order).padStart(2, "0")}`;
